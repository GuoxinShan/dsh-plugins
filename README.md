# dsh-plugins

我自写的 DeepSeek Harness (DSH) 动态 Cordis 插件仓库。每个插件一个目录，所有插件共用同一套约定（含 DSH 官方规范），便于长期积累。

## 目录约定

```
dsh-plugins/
├── README.md              # 本文件：总览、约定、官方规范要点
├── plugins/               # 插件本体，一个插件一个目录
│   ├── <plugin-id>/       # 插件目录名 = 插件 id（kebab-case）
│   │   ├── manifest.json  # 元数据：id/idPrefix/名称/用途/入口/依赖/凭据
│   │   ├── host.js        # Host 半源码（cordis_define 的 code.host 原文）
│   │   ├── client.js      # Client 半源码（cordis_define 的 code.client 原文）
│   │   └── README.md      # 该插件的说明：用途、凭据、入口、变更记录
│   └── _template/         # 新插件模板（复制后改名）
└── scripts/               # （预留）安装/校验脚本
```

## DSH 官方规范要点（动态插件）

来源：DSH `cordis_define`/`cordis_run` 工具契约与 `cordis-plugin-development` skill。写插件必须遵守：

1. **idPrefix**：新建插件只提交语义化前缀，**3–6 个小写英文字母**，宿主分配最终 pluginId（如 `mdlq` → `mdlq-1`）。
2. **纯 JavaScript**：`host.js`/`client.js` 都是 `return {...}` 的函数体；**禁止** TypeScript、JSX、`import`/`require`。Client 用 `React.createElement(...)` 构建元素。
3. **依赖声明**：硬依赖放 `inject: [...]`（进入等待直到服务出现）；可选服务用 `ctx.get(name)` 并处理 undefined；未声明不得直接 `ctx.xxx`。
4. **RPC 只走 JSON**：Host 用 `harness.handle(method, fn)`，Client 用 `host.call(method, args)`；参数与返回值必须是可 JSON 序列化的普通数据，禁止传函数/React 元素/服务对象。
5. **模型工具规范**：`harness.defineTool` 必须提供 `name`、`description`、`parameters`（per-property DSL）、`output: { schema, render(args, value) → ContentBlock[] }`、`execute(args)` 返回符合 `output.schema` 的值；`execute` 内不得做展示。
6. **槽位注册**：先查询目标槽位的契约（`Slots.listSubTree`），按返回的注册协议（key/id/order）注册；`tool.view.cordis` 固定用 `key: 'self'`。
7. **注册即 effect**：每个注册/监听/定时器都随插件 fiber 自动清理；外部订阅用 `ctx.effect` / `ctx.on`。
8. **定时器**：用 `inject: ['timer']` + `ctx.timer.timeout/interval`，不要用全局 `setTimeout`（动态沙箱里不存在）。
9. **版本**：Package 不可变；改代码 = 定义新 Package 并 `cordis_run mode: "update"`；`manifest.json` 的 `version` 同步升版本。

## 如何加载一个插件到 DSH

在 DSH 会话里对我说，例如：

> 把 `C:\Users\rocks\dsh-plugins\plugins\model-quota` 的插件加载进来

我会按仓库约定：读取 `manifest.json` + `host.js` + `client.js` → `cordis_define`（新插件用 manifest 的 `idPrefix`）→ `cordis_run` 激活。之后该插件即可用，直到 DSH 进程重启。

手动方式：在插件目录里执行

```powershell
Get-Content host.js -Raw   # 结果粘贴给 code.host
Get-Content client.js -Raw # 结果粘贴给 code.client
```

## 新增插件的步骤

1. 复制 `plugins/_template/` 为 `plugins/<plugin-id>/`
2. 填 `manifest.json`（id / idPrefix（3–6 小写字母）/ name / purpose）
3. 写 `host.js`（或删掉不要的半）
4. 写 `client.js`（或删掉不要的半）
5. 写 `README.md`（用途、凭据、入口、变更记录）
6. 在 DSH 里按"如何加载"激活并验证
