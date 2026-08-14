# AGENTS.md — dsh-plugins

个人自写的 DeepSeek Harness (DSH) **动态 Cordis 插件**仓库。本文件是仓库约定，任何在本仓库工作的 agent（包括 DSH 会话）都应遵守。官方动态插件规范见根 README「DSH 官方规范要点」章节，与本文件冲突时以官方规范为准。

## 仓库布局

```
plugins/<plugin-id>/     # 一个插件一个目录；目录名 = 插件 id（kebab-case）
  manifest.json          # 元数据：id / idPrefix / name / version / purpose / 入口 / requires / credentials
  host.js                # cordis_define 的 code.host 原文（return {...} 函数体）
  client.js              # cordis_define 的 code.client 原文（可缺失：纯 Host 插件无此文件）
  README.md              # 用途、凭据、入口、变更记录
plugins/_template/       # 新插件模板，新建插件必须复制它
.agents/skills/          # 本仓库的 agent skills（如 create-dsh-plugin）
```

## 写插件的硬性规范（来自 DSH 官方）

1. **idPrefix**：3–6 个小写英文字母；最终 pluginId 由宿主分配。
2. **纯 JavaScript**：host.js/client.js 都是 `return {...}`；禁 TypeScript/JSX/`import`/`require`；Client 用 `React.createElement`。
3. **依赖**：硬依赖 `inject: [...]`；可选服务 `ctx.get(name)` + undefined 检查；未声明不得 `ctx.xxx`。
4. **RPC 只走 JSON**：`harness.handle` / `host.call`；禁止传函数/元素/服务对象。
5. **模型工具**：`harness.defineTool` 必须含 `name`、`description`、`parameters`（per-property DSL）、`output: { schema, render }`、`execute` 返回符合 schema 的值。
6. **槽位**：先查契约再注册；`tool.view.cordis` 用 `key: 'self'`。
7. **注册即 effect**：监听/注册/定时器随 fiber 清理；定时器用 `inject: ['timer']` + `ctx.timer`。
8. **版本**：Package 不可变，改代码 = 新 Package + `cordis_run mode:"update"`；同步升 manifest 版本。

## 新增/修改插件的流程

1. 新插件：复制 `plugins/_template/` → `plugins/<plugin-id>/`，填 manifest（id / idPrefix / name / purpose），写 host.js / client.js / README.md。
2. 修改：直接编辑对应插件目录下的文件，`manifest.json` 升版本，README 变更记录追加一条。
3. 验证：在 DSH 会话中说「把 dsh-plugins 的 <plugin-id> 加载进来」，由 agent 按 manifest 走 `cordis_define` + `cordis_run` 激活验证。
4. 提交：`git add -A && git commit && git push`；提交信息用一句话说明改动（如 `feat: add xxx plugin`）。

## 安全

- **绝不提交凭据**：API key/token 一律运行时从 DSH 凭据库读取（apiKeyEnv），或存 `~/.dsh/.credentials.yaml`；不得写进 host.js/client.js/manifest。
- `.gitignore` 已排除凭据类文件；公开仓库更要守住这条。

## 工具

- 加载插件、调试插件、查看插件状态：在 DSH 会话用 `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_inspect_*`。
- 创建新插件：加载 `create-dsh-plugin` skill（`.agents/skills/create-dsh-plugin/SKILL.md`）。
