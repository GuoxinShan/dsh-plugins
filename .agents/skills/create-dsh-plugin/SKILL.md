---
name: create-dsh-plugin
description: Use when creating a new DeepSeek Harness (DSH) dynamic Cordis plugin in this repository, or when asked to "新建/添加一个插件" here. Follows the official DSH dynamic-plugin spec (README「DSH 官方规范要点」) and the repository conventions in AGENTS.md.
---

# Create a DSH Dynamic Plugin

在 dsh-plugins 仓库里新建一个 DSH 动态 Cordis 插件。产出：`plugins/<plugin-id>/` 目录（manifest.json + host.js + client.js + README.md），并在 DSH 会话中激活验证。

## 步骤

### 1. 确定插件形态

- **纯 Host**（文件/网络/工具/RPC，无 UI）：只有 host.js。
- **纯 Client**（UI，无宿主逻辑）：只有 client.js。
- **两者都要**：Host 做数据与工具，Client 渲染 UI（`harness.handle` ↔ `host.call`）。

### 2. 复制模板

```powershell
Copy-Item plugins/_template plugins/<plugin-id> -Recurse
```

`<plugin-id>` 用 kebab-case（如 `model-quota`）。

### 3. 填 manifest.json

必填字段：`id`（= 目录名）、`idPrefix`（3–6 个小写英文字母）、`name`（显示名）、`version`、`purpose`。
可选：`tool`（模型工具名）、`rpc`、`entrypoints`（槽位注册）、`requires`（inject 服务）、`credentials`（apiKeyEnv 名）。

### 4. 写源码（官方规范）

- 纯 JavaScript `return {...}` 函数体；禁 TS/JSX/import。
- 硬依赖 `inject: [...]`；可选服务 `ctx.get(name)` + undefined 检查。
- RPC：Host `harness.handle(method, async (args) => json)`；Client `host.call(method, args)`；只传 JSON。
- 模型工具：`harness.defineTool({ name, description, parameters, output: { schema, render }, execute })`；execute 返回符合 schema 的值。
- Client 渲染：`React.createElement`；槽位注册前先用 `Slots.listSubTree` 查契约；`tool.view.cordis` 固定 `key: 'self'`。
- 定时器：`inject: ['timer']` + `ctx.timer.timeout/interval`。
- 对外网络请求：经 shell 服务执行 curl（带 `danger-full-access` 策略），每个阶段加硬超时。

### 5. 写 README.md

用途、使用方式、需要的凭据（apiKeyEnv 名）、入口、变更记录（初始 0.1.0）。

### 6. 在 DSH 中激活验证

1. `cordis_define`：`plugin.kind: "new"`，`idPrefix` 用 manifest 的值；`code.host` / `code.client` 分别粘贴 host.js / client.js 原文。
2. `cordis_run` 激活（mode `run`；需要批准时等用户批准）。
3. 验证：工具出现在 `Tool.listTools`；Client 槽位出现 occupant（`Slots.listSubTree`）。
4. 之后每次修改：新 Package + `cordis_run mode:"update"`，manifest 升版本，README 追加变更记录。

### 7. 提交推送

```powershell
git add -A
git commit -m "feat: add <plugin-id> plugin"
git push
```

## 安全

凭据绝不入库：key/token 运行时从 DSH 凭据读取（apiKeyEnv 指向 `~/.dsh/.credentials.yaml`），不得写入源码或 manifest 的除环境变量名以外的任何位置。
