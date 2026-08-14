return {
  name: 'model-quota-host',
  inject: ['timer'],
  apply(ctx) {
    const usageCache = {}
    const CACHE_TTL = 5 * 60 * 1000
    const t = ctx.timer

    // pi-ai catalog 已知 provider 的默认 baseURL（settings 未显式配置时兜底）
    const CATALOG_BASE_URLS = {
      'opencode-go': 'https://opencode.ai/zen/go/v1',
      'opencode': 'https://opencode.ai/zen/v1',
      'zai-coding-cn': 'https://open.bigmodel.cn/api/coding/paas/v4',
      'kimi-coding': 'https://api.kimi.com/coding',
      'moonshotai-cn': 'https://api.moonshot.cn/v1',
      'moonshotai': 'https://api.moonshot.ai/v1',
      'xiaomi-token-plan-cn': 'https://token-plan-cn.xiaomimimo.com/v1',
      'qwen-token-plan-cn': 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    }

    async function withStage(label, fn) {
      try {
        return await fn()
      } catch (e) {
        const detail = e && e.message ? e.message : String(e)
        throw new Error(label + ': ' + detail)
      }
    }

    function deadline(promise, ms, label) {
      return Promise.race([
        promise,
        t.timeout(ms).then(() => { throw new Error(label + ' 超时 (' + ms + 'ms)' + '：该阶段挂起') }),
      ])
    }

    function fullAccessPolicy() {
      const policyService = ctx.get('sandboxPolicy')
      if (policyService === undefined) return undefined
      try { return policyService.resolve({ mode: 'danger-full-access' }) } catch (e) { return undefined }
    }

    async function shellOut(command, label, maxBytes, timeoutMs) {
      const shell = ctx.get('shell') || ctx.get('bash')
      if (shell === undefined) throw new Error('shell 服务不可用 (ctx.get("shell") 为空)')
      const sandboxPolicy = fullAccessPolicy()
      const spec = shell.resolve({ command, timeoutMs, stdoutMaxBytes: maxBytes, sandboxPolicy })
      return deadline(shell.run(spec), timeoutMs + 5000, label)
    }

    async function httpGetJson(url, apiKey, label, authStyle) {
      const binaries = ['curl.exe', 'curl']
      const auth = authStyle === 'raw' ? apiKey : 'Bearer ' + apiKey
      let lastError = null
      for (const binary of binaries) {
        const command = binary + ' -s --max-time 10 -H "Authorization: ' + auth + '" -H "Content-Type: application/json" "' + url + '"'
        try {
          console.log('quota: GET', binary, url, 'at', Date.now())
          const res = await shellOut(command, label + ' (' + url + ')', 131072, 20000)
          const stdout = (res.stdout && res.stdout.text) || ''
          const stderr = (res.stderr && res.stderr.text) || ''
          console.log('quota: exit', res.exitCode, 'stdout', stdout.length, 'stderr', stderr.length, 'at', Date.now())
          if (res.exitCode !== 0) {
            lastError = { code: 'exit-' + res.exitCode, stderr: stderr.slice(0, 300) }
            if (!/not recognized|not found|No such file/i.test(stderr)) break
            continue
          }
          if (!stdout) {
            lastError = { code: 'empty', stderr: stderr.slice(0, 200) }
            break
          }
          const parsed = JSON.parse(stdout)
          return { ok: true, json: parsed }
        } catch (e) {
          lastError = { code: 'parse', stderr: String(e && e.message || e).slice(0, 200) }
        }
      }
      return { ok: false, error: lastError || { code: 'unknown' } }
    }

    function strategyFor(baseURL) {
      const u = baseURL.replace(/\/+$/, '')
      if (u.includes('api.kimi.com/coding')) return { type: 'kimi-plan', url: 'https://api.kimi.com/coding/v1/usages' }
      if ((u.includes('/api/coding/') || u.includes('/api/anthropic')) && (u.includes('bigmodel.cn') || u.includes('api.z.ai'))) {
        return {
          type: 'zhipu-plan',
          url: (u.includes('bigmodel.cn') ? 'https://open.bigmodel.cn' : 'https://api.z.ai') + '/api/monitor/usage/quota/limit',
        }
      }
      if (u.includes('opencode.ai/zen/go')) return { type: 'windows', url: u + '/usage' }
      if (/api\.moonshot\.(cn|ai)/.test(u)) return { type: 'moonshot', url: 'https://api.moonshot.cn/v1/users/me/balance' }
      if (u.includes('open.bigmodel.cn')) return { type: 'bigmodel', url: 'https://open.bigmodel.cn/api/paas/v4/balance' }
      if (u.includes('api.deepseek.com')) return { type: 'deepseek', url: 'https://api.deepseek.com/user/balance' }
      return { type: 'billing', base: u }
    }

    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
    const pct = (a, b) => (a === null || b === null || b <= 0) ? null : Math.max(0, Math.min(100, Math.round(a / b * 100)))

    function formatReset(ms) {
      if (ms === null || ms === undefined) return ''
      const n = Number(ms)
      if (!Number.isFinite(n) || n <= 0) return ''
      try { return new Date(n).toLocaleString() } catch (e) { return '' }
    }

    function planRow(label, limit, remaining, resetRaw) {
      const l = num(limit)
      const r = num(remaining)
      const used = (l === null || r === null) ? null : Math.max(0, l - r)
      const percentUsed = (used === null || l === null || l <= 0) ? null : Math.round(used / l * 100)
      return {
        label,
        percentUsed,
        percentRemaining: percentUsed === null ? null : Math.max(0, Math.min(100, 100 - percentUsed)),
        resetsAt: formatReset(resetRaw),
        usageText: (used !== null ? '已用 ' + used : '') + (r !== null ? (used !== null ? ' / 剩 ' : '剩 ') + r : ''),
      }
    }

    async function providerEntryFor(providerId) {
      const llm = ctx.get('llm')
      const settings = ctx.get('settings')
      const credentials = ctx.get('credentials')
      if (llm === undefined || settings === undefined) {
        throw new Error('llm 或 settings 服务不可用')
      }
      const directory = llm.listConfigurableProviders()
      const entry = directory.find((e) => e.provider === providerId)
      if (entry === undefined) {
        throw new Error('当前选中的 provider "' + providerId + '" 不在 DSH 的 provider 目录中')
      }
      let value
      try { value = settings.get(entry.settingsNs) } catch (e) { value = undefined }
      if (value === undefined || value === null || typeof value !== 'object') {
        throw new Error('provider "' + providerId + '" 的 settings 命名空间 (' + entry.settingsNs + ') 未配置')
      }
      let profile = value
      let profilePath = []
      if (entry.settingsPath && entry.settingsPath.length > 0) {
        profile = entry.settingsPath.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), value)
        profilePath = entry.settingsPath
      }
      if (profile === undefined || profile === null || typeof profile !== 'object') {
        throw new Error('provider "' + providerId + '" 未激活（settings 中无该 profile）')
      }
      const apiKeyEnv = (typeof profile.apiKeyEnv === 'string' && profile.apiKeyEnv)
        || (typeof value.apiKeyEnv === 'string' && value.apiKeyEnv)
        || undefined
      let apiKey
      if (apiKeyEnv !== undefined && credentials !== undefined) {
        try {
          const cred = await deadline(credentials.resolve(apiKeyEnv), 5000, 'credentials.resolve(' + apiKeyEnv + ')')
          apiKey = cred !== undefined && cred.value ? String(cred.value) : undefined
        } catch (e) { apiKey = undefined }
      }
      let baseURL = (typeof profile.baseURL === 'string' && profile.baseURL)
        || (typeof value.baseURL === 'string' && value.baseURL)
        || CATALOG_BASE_URLS[providerId]
        || undefined
      const models = Array.isArray(profile.models)
        ? profile.models.map((m) => ({ id: String(m && m.id || ''), name: String(m && m.name || '') })).filter((m) => m.id)
        : []
      return {
        name: entry.displayName || providerId,
        apiKey,
        baseURL,
        models,
        source: 'DSH ' + entry.settingsNs + (profilePath.length > 0 ? '/' + profilePath.join('.') : '') + (baseURL && !profile.baseURL && !value.baseURL ? '（catalog 默认）' : ''),
      }
    }

    async function queryProvider(provider) {
      if (!provider.baseURL) {
        return { name: provider.name, models: provider.models, source: provider.source, error: '该 provider 未配置 baseURL，无法查询余量（请检查 settings 或 provider 目录）' }
      }
      if (!provider.apiKey) {
        return { name: provider.name, models: provider.models, source: provider.source, error: '该 provider 缺少 API key（apiKeyEnv 未解析到凭据）' }
      }
      const strategy = strategyFor(provider.baseURL)
      try {
        if (strategy.type === 'kimi-plan') {
          const res = await httpGetJson(strategy.url, provider.apiKey, 'curl 请求')
          if (!res.ok) throw new Error('请求失败: ' + JSON.stringify(res.error))
          const j = res.json
          const rows = []
          if (Array.isArray(j.limits)) {
            for (const item of j.limits) {
              const detail = item && item.detail
              if (!detail) continue
              rows.push(planRow('5小时窗口', detail.limit, detail.remaining, detail.resetTime))
            }
          }
          if (j.usage && typeof j.usage === 'object') {
            rows.push(planRow('每周额度', j.usage.limit, j.usage.remaining, j.usage.resetTime))
          }
          if (rows.length === 0) throw new Error('usages 接口响应缺少限额数据: ' + String(JSON.stringify(j)).slice(0, 200))
          return { name: provider.name, models: provider.models, source: provider.source, type: 'plan', level: '', limits: rows }
        }
        if (strategy.type === 'zhipu-plan') {
          const res = await httpGetJson(strategy.url, provider.apiKey, 'curl 请求', 'raw')
          if (!res.ok) throw new Error('请求失败: ' + JSON.stringify(res.error))
          const j = res.json
          if (!j || j.success !== true || !j.data) {
            throw new Error('quota 接口异常: ' + String(JSON.stringify(j)).slice(0, 200))
          }
          const limits = Array.isArray(j.data.limits) ? j.data.limits : []
          const rows = []
          for (const l of limits) {
            // 过滤工具次数配额（TIME_LIMIT），只显示 Token 窗口
            if (l.type === 'TIME_LIMIT') continue
            const used = num(l.percentage)
            const label = l.unit === 3 ? '5小时窗口' : l.unit === 6 ? '每周窗口' : 'Token 额度'
            rows.push({
              label,
              percentUsed: used,
              percentRemaining: used === null ? null : Math.max(0, Math.min(100, 100 - used)),
              resetsAt: l.nextResetTime ? formatReset(l.nextResetTime) : '',
              usageText: '',
            })
          }
          if (rows.length === 0) {
            throw new Error('quota 接口没有 Token 限额数据')
          }
          return {
            name: provider.name, models: provider.models, source: provider.source,
            type: 'plan', level: j.data.level === undefined ? '' : String(j.data.level), limits: rows,
          }
        }
        if (strategy.type === 'windows') {
          const res = await httpGetJson(strategy.url, provider.apiKey, 'curl 请求')
          if (!res.ok) throw new Error('请求失败: ' + JSON.stringify(res.error))
          const usage = res.json && res.json.usage
          if (!usage || typeof usage !== 'object') throw new Error('usage 接口响应缺少 usage 字段')
          const windows = {}
          for (const w of ['rolling', 'weekly', 'monthly']) {
            const win = usage[w]
            if (!win || typeof win !== 'object') continue
            const percent = num(win.percent)
            windows[w] = {
              status: win.status === undefined ? 'unknown' : String(win.status),
              percentUsed: percent,
              percentRemaining: percent === null ? null : Math.max(0, Math.min(100, 100 - percent)),
              resetsAt: win.resetsAt === undefined ? '' : String(win.resetsAt),
            }
          }
          return { name: provider.name, models: provider.models, source: provider.source, type: 'windows', windows }
        }
        if (strategy.type === 'moonshot') {
          const res = await httpGetJson(strategy.url, provider.apiKey, 'curl 请求')
          if (!res.ok) throw new Error('请求失败: ' + JSON.stringify(res.error))
          const j = res.json
          const available = num(j.balance)
          const total = num(j.total_balance)
          return {
            name: provider.name, models: provider.models, source: provider.source,
            type: 'balance', available, total, currency: j.currency || 'CNY',
            percent: pct(available, total),
          }
        }
        if (strategy.type === 'bigmodel') {
          const res = await httpGetJson(strategy.url, provider.apiKey, 'curl 请求')
          if (!res.ok) throw new Error('请求失败: ' + JSON.stringify(res.error))
          const j = res.json
          const entry = Array.isArray(j.balance) && j.balance.length > 0 ? j.balance[0] : null
          if (!entry) throw new Error('balance 接口响应缺少余额条目（该账号可能无余额接口）')
          const available = num(entry.available)
          const total = num(entry.total)
          return {
            name: provider.name, models: provider.models, source: provider.source,
            type: 'balance', available, total, currency: entry.currency || 'CNY',
            percent: pct(available, total),
          }
        }
        if (strategy.type === 'deepseek') {
          const res = await httpGetJson(strategy.url, provider.apiKey, 'curl 请求')
          if (!res.ok) throw new Error('请求失败: ' + JSON.stringify(res.error))
          const j = res.json
          const info = Array.isArray(j.balance_infos) && j.balance_infos.length > 0 ? j.balance_infos[0] : null
          if (!info) throw new Error('user/balance 接口响应缺少余额信息')
          const total = num(info.total_balance)
          const granted = num(info.granted_balance)
          const topped = num(info.topped_up_balance)
          const available = (granted === null || topped === null) ? null : granted + topped
          return {
            name: provider.name, models: provider.models, source: provider.source,
            type: 'balance', available, total, currency: info.currency || 'CNY',
            percent: pct(available, total),
          }
        }
        const sub = await httpGetJson(strategy.base + '/dashboard/billing/subscription', provider.apiKey, 'curl 请求')
        if (!sub.ok || !sub.json) throw new Error('该 provider 无已知余量接口 (billing subscription 不可用): ' + JSON.stringify(sub.error || {}))
        const usage = await httpGetJson(strategy.base + '/dashboard/billing/usage', provider.apiKey, 'curl 请求')
        if (!usage.ok || !usage.json) throw new Error('该 provider 无已知余量接口 (billing usage 不可用): ' + JSON.stringify(usage.error || {}))
        const hard = num(sub.json.hard_limit_usd)
        const used = num(usage.json.total_usage)
        const remaining = (hard === null || used === null) ? null : Math.max(0, hard - used)
        return {
          name: provider.name, models: provider.models, source: provider.source,
          type: 'percent', used, total: hard, currency: 'USD',
          percent: pct(remaining, hard),
        }
      } catch (e) {
        return { name: provider.name, models: provider.models, source: provider.source, error: e && e.message ? e.message : String(e) }
      }
    }

    async function getUsage(refresh) {
      const defaultModel = ctx.get('agentDefaultModel')
      if (defaultModel === undefined) {
        throw new Error('agentDefaultModel 服务不可用，无法读取当前选中的模型')
      }
      const selection = defaultModel.currentSelection()
      if (!selection || !selection.provider || !selection.model) {
        throw new Error('当前未选中模型（provider/model 缺失）')
      }
      const key = selection.provider
      if (!refresh && usageCache[key] !== undefined && Date.now() - usageCache[key].ts < CACHE_TTL) {
        return { cached: true, selection, ...usageCache[key].data }
      }
      const provider = await withStage('读取当前 provider 配置', () => providerEntryFor(selection.provider))
      const results = [await queryProvider(provider)]
      const data = { providers: results, fetchedAt: new Date().toISOString() }
      usageCache[key] = { ts: Date.now(), data }
      return { cached: false, selection, ...data }
    }

    function formatSummary(data) {
      const lines = ['模型余量（账户级配额）:']
      for (const p of data.providers) {
        if (p.error) {
          lines.push('- ' + p.name + ': ' + p.error)
          continue
        }
        if (p.type === 'windows') {
          lines.push('- ' + p.name + ':')
          for (const w of ['rolling', 'weekly', 'monthly']) {
            const u = p.windows && p.windows[w]
            if (!u) continue
            const used = u.percentUsed === null ? '未知' : u.percentUsed + '%'
            const remaining = u.percentRemaining === null ? '未知' : u.percentRemaining + '%'
            const reset = u.resetsAt ? new Date(u.resetsAt).toLocaleString() : '未知'
            lines.push('  - ' + (w === 'rolling' ? '滚动窗口' : w === 'weekly' ? '每周' : '每月') + ': 已用 ' + used + '，剩余 ' + remaining + '，重置于 ' + reset)
          }
        } else if (p.type === 'plan') {
          lines.push('- ' + p.name + (p.level ? '（套餐等级: ' + p.level + '）' : '') + ':')
          for (const l of p.limits || []) {
            const used = l.percentUsed === null ? '未知' : l.percentUsed + '%'
            const remaining = l.percentRemaining === null ? '未知' : l.percentRemaining + '%'
            lines.push('  - ' + l.label + ': 已用 ' + used + '，剩余 ' + remaining + (l.resetsAt ? '，重置 ' + l.resetsAt : '') + (l.usageText ? '（' + l.usageText + '）' : ''))
          }
        } else if (p.type === 'balance') {
          lines.push('- ' + p.name + ': 可用 ' + (p.available === null ? '未知' : p.available) + ' ' + (p.currency || '') + ' / 总额 ' + (p.total === null ? '未知' : p.total) + (p.percent === null ? '' : '（剩余 ' + p.percent + '%）'))
        } else {
          lines.push('- ' + p.name + ': 剩余 ' + (p.percent === null ? '未知' : p.percent + '%') + (p.total === null ? '' : '（总额 ' + p.total + ' USD）'))
        }
        if (p.models && p.models.length > 0) {
          lines.push('  覆盖模型: ' + p.models.map((m) => m.id).join(', '))
        }
      }
      lines.push('当前模型: ' + (data.selection ? data.selection.provider + ' / ' + data.selection.model : '未知'))
      lines.push('查询时间: ' + new Date(data.fetchedAt).toLocaleString())
      return lines.join('\n')
    }

    harness.handle('quota/ping', async () => ({
      ok: true,
      data: { pong: true, hostTime: Date.now() },
    }))

    harness.handle('quota/usage', async (args) => {
      const refresh = args && typeof args === 'object' && args.refresh === true
      const work = (async () => {
        try {
          const data = await getUsage(refresh)
          return { ok: true, data }
        } catch (error) {
          return { ok: false, error: error && error.message ? error.message : String(error) }
        }
      })()
      return Promise.race([
        work,
        t.timeout(50000).then(() => ({ ok: false, error: '查询超时 (50s): 宿主侧未完成，请检查宿主终端日志与网络' })),
      ])
    })

    harness.registerTool(ctx, harness.defineTool({
      name: 'model_quota',
      description: '查询当前会话选中模型的 provider 账户余量（OpenCode Go 显示滚动/每周/每月窗口，智谱 Coding 套餐与 Kimi For Coding 显示限额窗口，Moonshot/DeepSeek 显示余额，one-api 类代理显示 billing）。结果缓存 5 分钟。',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render(_args, value) { return [{ type: 'text', text: value }] },
      },
      async execute() {
        try {
          const data = await getUsage(false)
          return formatSummary(data)
        } catch (error) {
          return '查询失败: ' + (error && error.message ? error.message : String(error))
        }
      },
    }))
  },
}
