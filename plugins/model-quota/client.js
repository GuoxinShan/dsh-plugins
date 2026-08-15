return {
  name: 'model-quota-ui',
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    styles.insert(`
.ocgo-panel { color: var(--dsw-alias-label-primary); }
.ocgo-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ocgo-title { font-weight: 600; font-size: 13px; }
.ocgo-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.ocgo-refresh { margin-left: auto; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 2px 10px; font-size: 12px; cursor: pointer; }
.ocgo-refresh:disabled { opacity: .6; cursor: default; }
.ocgo-step { font-size: 11px; color: var(--dsw-alias-label-secondary); margin: 2px 0; }
.ocgo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
.ocgo-card { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 8px; padding: 10px 12px; }
.ocgo-card-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; }
.ocgo-row { display: flex; align-items: center; gap: 8px; }
.ocgo-row-label { flex: none; width: 76px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ocgo-row-bar { flex: 1; height: 6px; border-radius: 999px; background: var(--dsw-alias-interactive-bg-hover); overflow: hidden; }
.ocgo-row-fill { height: 100%; border-radius: 999px; }
.ocgo-row-pct { flex: none; min-width: 44px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.ocgo-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; margin: 4px 0; white-space: pre-wrap; }
.ocgo-entry-btn { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer; }
.ocgo-entry-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.ocgo-entry-btn-active { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.ocgo-dropdown { position: fixed; width: 380px; max-height: 70vh; overflow: auto; box-sizing: border-box; padding: 12px; border: 1px solid var(--dsw-alias-border-inverted); border-radius: 12px; background: var(--dsw-specific-menu); box-shadow: var(--dsw-shadow-lv3); color: var(--dsw-alias-label-primary); pointer-events: auto; z-index: 1000; }
.ocgo-close { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 14px; padding: 2px 6px; }
.ocgo-close:hover { color: var(--dsw-alias-label-primary); }
`)

    const barColor = (r) => r === null ? 'var(--dsw-alias-label-secondary)'
      : r <= 10 ? 'var(--dsw-alias-state-error-primary)'
      : r <= 30 ? 'var(--dsw-alias-state-warn-primary)'
      : 'var(--dsw-alias-state-success-primary)'
    const fmtNum = (n) => n === null || n === undefined ? '--' : String(Math.round(n * 100) / 100)

    const quotaListeners = new Set()
    let quotaState = { open: false, anchor: null }
    function setQuota(next) {
      quotaState = next
      for (const l of quotaListeners) l(quotaState)
    }
    function subscribeQuota(listener) {
      quotaListeners.add(listener)
      return () => { quotaListeners.delete(listener) }
    }

    function raceTimeout(promise, ms, message) {
      return Promise.race([
        promise,
        ctx.timer.timeout(ms).then(() => { throw new Error(message) }),
      ])
    }

    function usageArgs(refresh, sessionId) {
      const args = {}
      if (refresh === true) args.refresh = true
      if (sessionId !== undefined && sessionId !== null && sessionId !== '') args.sessionId = String(sessionId)
      return args
    }

    function loadAll(setState, refresh, sessionId) {
      setState({ loading: true, phase: 'ping', data: null, error: null })
      raceTimeout(host.call('quota/ping', {}), 8000, 'ping 超时 (8s)：浏览器→宿主 RPC 未响应')
        .then((ping) => {
          if (!(ping && ping.ok)) throw new Error((ping && ping.error) || 'ping 失败')
          setState({ loading: true, phase: 'usage', data: null, error: null })
          return raceTimeout(host.call('quota/usage', usageArgs(refresh, sessionId)), 45000, '余量查询超时 (45s)：宿主侧某阶段挂起')
        })
        .then((res) => {
          if (res && res.ok && res.data) setState({ loading: false, phase: 'done', data: res.data, error: null })
          else throw new Error((res && res.error) || '未知错误')
        })
        .catch((err) => {
          setState({ loading: false, phase: 'error', data: null, error: String((err && err.message) || err) })
        })
    }

    function limitRows(limits) {
      return (limits || []).map((l, i) => {
        const used = l.percentUsed === null || l.percentUsed === undefined ? null : l.percentUsed
        const fill = used === null ? 0 : Math.max(0, Math.min(100, used))
        return React.createElement('div', { className: 'ocgo-row', key: i, title: (l.usageText ? l.usageText + ' · ' : '') + (l.resetsAt ? '重置 ' + l.resetsAt : '') },
          React.createElement('span', { className: 'ocgo-row-label' }, l.label),
          React.createElement('div', { className: 'ocgo-row-bar' },
            React.createElement('div', { className: 'ocgo-row-fill', style: { width: fill + '%', background: barColor(l.percentRemaining) } })),
          React.createElement('span', { className: 'ocgo-row-pct' }, l.percentRemaining === null || l.percentRemaining === undefined ? '--' : l.percentRemaining + '%'))
      })
    }

    function providerCard(p) {
      if (p.error) {
        return React.createElement('div', { className: 'ocgo-card', key: p.name },
          React.createElement('div', { className: 'ocgo-error' }, p.error))
      }
      if (p.type === 'windows' || p.type === 'plan') {
        const rows = p.type === 'windows'
          ? (['rolling', 'weekly', 'monthly'].map((w) => {
              const u = p.windows && p.windows[w]
              if (!u) return null
              return { label: w === 'rolling' ? '滚动窗口' : w === 'weekly' ? '每周' : '每月', percentUsed: u.percentUsed, percentRemaining: u.percentRemaining, resetsAt: u.resetsAt }
            }).filter(Boolean))
          : p.limits
        return React.createElement('div', { className: 'ocgo-card', key: p.name },
          p.level ? React.createElement('div', { className: 'ocgo-card-meta' }, '套餐等级: ' + p.level) : null,
          limitRows(rows))
      }
      const remaining = p.percent
      const fill = remaining === null ? 0 : Math.max(0, Math.min(100, 100 - remaining))
      const meta = p.type === 'balance'
        ? '可用 ' + fmtNum(p.available) + ' / 总额 ' + fmtNum(p.total) + ' ' + (p.currency || '')
        : '已用 ' + fmtNum(p.used) + ' / 总额 ' + fmtNum(p.total) + ' ' + (p.currency || '')
      return React.createElement('div', { className: 'ocgo-card', key: p.name },
        React.createElement('div', { className: 'ocgo-card-remaining', style: { fontSize: '24px', fontWeight: 700, margin: '2px 0' } },
          remaining === null ? '--' : remaining + '%',
          React.createElement('small', { style: { fontSize: '12px', fontWeight: 400, color: 'var(--dsw-alias-label-secondary)' } }, ' 剩余')),
        React.createElement('div', { className: 'ocgo-bar', style: { height: '8px', borderRadius: '4px', background: 'var(--dsw-alias-bg-layer-2)', overflow: 'hidden', margin: '4px 0' } },
          React.createElement('div', { className: 'ocgo-bar-fill', style: { width: fill + '%', height: '100%', background: barColor(remaining) } })),
        React.createElement('div', { className: 'ocgo-card-meta' }, meta))
    }

    function QuotaBody({ state, load }) {
      if (state.loading) {
        return React.createElement('div', { className: 'ocgo-step' },
          state.phase === 'ping' ? '连接宿主中…' : '查询余量中…')
      }
      if (state.error) {
        return React.createElement('div', { className: 'ocgo-error' }, state.error)
      }
      const providers = (state.data && state.data.providers) || []
      const cards = providers.map(providerCard)
      return React.createElement('div', { className: 'ocgo-grid' }, cards)
    }

    function useQuotaState(sessionId) {
      const [state, setState] = React.useState({ loading: true, phase: 'ping', data: null, error: null })
      const load = (refresh) => { loadAll(setState, refresh, sessionId) }
      React.useEffect(() => { loadAll(setState, false, sessionId) }, [sessionId])
      return { state, load }
    }

    function QuotaHeaderButton() {
      const [ui, setUi] = React.useState(quotaState)
      const btnRef = React.useRef(null)
      React.useEffect(() => subscribeQuota(setUi), [])
      return React.createElement('button', {
        ref: btnRef,
        type: 'button',
        className: ui.open ? 'ocgo-entry-btn ocgo-entry-btn-active' : 'ocgo-entry-btn',
        'aria-expanded': ui.open,
        onClick: () => {
          const rect = btnRef.current.getBoundingClientRect()
          setQuota({ open: !quotaState.open, anchor: { top: rect.bottom, right: window.innerWidth - rect.right } })
        },
      }, '余量')
    }

    function QuotaDropdown(props) {
      const [ui, setUi] = React.useState(quotaState)
      React.useEffect(() => subscribeQuota(setUi), [])
      // root 作用域槽位：当前会话 id 从全局会话列表取
      const currentSessionId = props.useSessions(s => s.current)
      const quota = useQuotaState(currentSessionId)
      const rootRef = React.useRef(null)
      React.useEffect(() => {
        if (!ui.open) return
        const onPointerDown = (e) => {
          if (rootRef.current && rootRef.current.contains(e.target)) return
          if (e.target && typeof e.target.closest === 'function' && e.target.closest('.ocgo-entry-btn')) return
          setQuota({ open: false, anchor: null })
        }
        const onKeyDown = (e) => {
          if (e.key === 'Escape') setQuota({ open: false, anchor: null })
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [ui.open])
      if (!ui.open || !ui.anchor) return null
      const sub = quota.state.data && quota.state.data.selection
        ? quota.state.data.selection.provider + ' · ' + quota.state.data.selection.model + (quota.state.data.cached ? ' · 缓存' : '')
        : ''
      return React.createElement('div', {
        ref: rootRef,
        className: 'ocgo-dropdown',
        style: { top: (ui.anchor.top + 8) + 'px', right: ui.anchor.right + 'px' },
      },
        React.createElement('div', { className: 'ocgo-head' },
          React.createElement('span', { className: 'ocgo-title' }, '模型余量'),
          sub ? React.createElement('span', { className: 'ocgo-sub' }, sub) : null,
          React.createElement('button', { className: 'ocgo-refresh', onClick: () => quota.load(true), disabled: quota.state.loading }, '刷新'),
          React.createElement('button', { className: 'ocgo-close', 'aria-label': '关闭', onClick: () => { setQuota({ open: false, anchor: null }) } }, '✕')),
        React.createElement(QuotaBody, { state: quota.state, load: quota.load }))
    }

    function QuotaRunCard(props) {
      const quota = useQuotaState(props.sessionId)
      const sub = quota.state.data && quota.state.data.selection
        ? quota.state.data.selection.provider + ' · ' + quota.state.data.selection.model + (quota.state.data.cached ? ' · 缓存' : '')
        : ''
      return React.createElement('div', { className: 'ocgo-panel' },
        React.createElement('div', { className: 'ocgo-head' },
          React.createElement('span', { className: 'ocgo-title' }, '模型余量'),
          sub ? React.createElement('span', { className: 'ocgo-sub' }, sub) : null,
          React.createElement('button', { className: 'ocgo-refresh', onClick: () => quota.load(true), disabled: quota.state.loading }, '刷新')),
        React.createElement(QuotaBody, { state: quota.state, load: quota.load }))
    }

    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      (props) => React.createElement(QuotaRunCard, props),
    ))
    slots.inject('conversation.session.header.actions', () => slots.register(
      { name: 'conversation.session.header.actions', id: 'model-quota', order: 30, label: '余量' },
      () => React.createElement(QuotaHeaderButton, null),
    ))
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'model-quota', order: 110 },
      (props) => React.createElement(QuotaDropdown, props),
    ))
  },
}
