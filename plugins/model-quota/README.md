# 模型余量 (model-quota)

查看**当前会话选中模型**的 provider 账户余量/套餐额度。数据按 provider 的 baseURL 自动匹配接口，结果缓存 5 分钟（点"刷新"强制重查）。

## 使用

1. 在 DSH 的 Models 页面配置好 provider（apiKeyEnv 指向 DSH 凭据）
2. 会话输入框选中该 provider 的任意模型
3. 点标题栏 **"余量"** 按钮（按钮下方弹出卡片），或直接对我说"查余量"（`model_quota` 工具）

## 支持的 provider 与数据源

| provider | 匹配 | 接口 | 显示 |
|---|---|---|---|
| OpenCode Go | baseURL 含 `opencode.ai/zen/go` | `{base}/usage`（Bearer） | 滚动/每周/每月窗口 |
| 智谱 Coding 套餐 | baseURL 含 `bigmodel.cn/api/coding` 或 `api.z.ai` | `{host}/api/monitor/usage/quota/limit`（**raw token，无 Bearer**） | 套餐等级 + 5小时/每周 Token 窗口 |
| Kimi For Coding | baseURL 含 `api.kimi.com/coding` | `https://api.kimi.com/coding/v1/usages`（Bearer） | 5小时窗口 + 每周额度 |
| Moonshot | baseURL 含 `api.moonshot.cn\|ai` | `https://api.moonshot.cn/v1/users/me/balance` | 可用/总额余额 |
| DeepSeek | baseURL 含 `api.deepseek.com` | `https://api.deepseek.com/user/balance` | 可用/总额余额 |
| one-api 类代理 | 其余 openai 兼容 baseURL | `{base}/dashboard/billing/subscription` + `/usage` | 剩余 % |

baseURL 未在 settings 显式配置时，按 provider id 从 pi-ai catalog 兜底（见 `host.js` 的 `CATALOG_BASE_URLS`）。

## 需要的凭据（apiKeyEnv）

- `OPENCODE_GO_API_KEY`（OpenCode Go）
- `ZAI_CODING_CN_API_KEY`（智谱 Coding）
- `KIMI_CODING_API_KEY`（Kimi For Coding，需要时）
- `MOONSHOT_API_KEY` / `DEEPSEEK_API_KEY`（余额型，需要时）

## 入口

- `tool.view.cordis`（key `self`）：Run 卡片面板
- `conversation.session.header.actions`（id `model-quota`）：标题栏"余量"按钮
- `shell.overlay`（id `model-quota`）：锚定下拉卡片
- 工具：`model_quota`；RPC：`quota/ping`、`quota/usage`

## 变更记录

- 1.0.0：归档当前版本（原 ocgo-1 动态插件 pkg-21 的最终形态；重命名 + 精简智谱显示 + TIME_LIMIT 字段修正后的稳定版）
- 演进历史（pkg-1 ~ pkg-21）：OpenCode Go 专用 → DSH provider 扫描 → 当前选中模型 → 多 provider 接口自动匹配 → 缓存/看门狗/诊断
