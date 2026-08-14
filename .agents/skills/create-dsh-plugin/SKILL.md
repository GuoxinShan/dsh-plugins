---
name: create-dsh-plugin
description: Use when creating a new DeepSeek Harness (DSH) dynamic Cordis plugin in this repository, or when asked to "新建/添加一个插件" here. The OFFICIAL authoring spec is the full `cordis-plugin-development` skill in this same directory — load it first and follow it; this skill adds only the repository-level workflow on top.
---

# Create a DSH Dynamic Plugin（仓库层封装）

**官方规范以 `.agents/skills/cordis-plugin-development/SKILL.md` 为准（必须完整加载并遵循），本 skill 只补充本仓库的流程约定。**

## 仓库流程

### 1. 复制模板

```powershell
Copy-Item plugins/_template plugins/<plugin-id> -Recurse
```

`<plugin-id>` 用 kebab-case（如 `model-quota`）。

### 2. 填 manifest.json

必填：`id`（= 目录名）、`idPrefix`（**3–6 个小写英文字母**，官方要求）、`name`、`version`、`purpose`。
可选：`rpc`、`entrypoints`（槽位注册）、`requires`（inject 服务）、`credentials`（apiKeyEnv 名）。

### 3. 按官方 skill 写源码

- `host.js` / `client.js` 是 `cordis_define` 的 `code.host` / `code.client` **原文**（纯 JS，无 TS/JSX/import；Client 用 React.createElement）
- 工具注册、槽位注册、RPC、定时器、effect 清理等一切细节遵循官方 skill
- 对外网络请求：经 shell 服务执行 curl（带 `danger-full-access` 策略），每个阶段加硬超时（参考 `plugins/model-quota/host.js`）

### 4. 写 README.md

用途、使用方式、需要的凭据（apiKeyEnv 名）、入口、变更记录。

### 5. 在 DSH 中激活验证

1. `cordis_define`：`plugin.kind: "new"`，idPrefix 用 manifest 值；`code.host`/`code.client` 粘贴源码原文。
2. `cordis_run` 激活（mode `run`；需要批准时等用户批准）。
3. 验证：工具出现在 `Tool.listTools`（如有）；Client 槽位出现 occupant（`Slots.listSubTree`）。
4. 之后每次修改：新 Package + `cordis_run mode:"update"`，manifest 升版本，README 追加变更记录。

### 6. 提交推送

```powershell
git add -A
git commit -m "feat: add <plugin-id> plugin"
git push
```

## 安全

凭据绝不入库：key/token 运行时从 DSH 凭据读取（apiKeyEnv 指向 `~/.dsh/.credentials.yaml`），不得写入源码。
