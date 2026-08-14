# dsh-plugins

我自写的 DeepSeek Harness (DSH) 动态 Cordis 插件仓库。每个插件一个目录，所有插件共用同一套约定，便于长期积累。

## 目录约定

```
dsh-plugins/
├── README.md              # 本文件：总览与约定
├── plugins/               # 插件本体，一个插件一个目录
│   ├── <plugin-id>/       # 插件目录名 = 插件 id（kebab-case）
│   │   ├── manifest.json  # 元数据：名称/用途/版本/入口/依赖/凭据
│   │   ├── host.js        # Host 半源码（cordis_define 的 code.host 内容）
│   │   ├── client.js      # Client 半源码（cordis_define 的 code.client 内容）
│   │   └── README.md      # 该插件的说明：用途、凭据、入口、变更记录
│   └── _template/         # 新插件模板（复制后改名）
└── scripts/               # （预留）安装/校验脚本
```

## 插件约定

- **插件 id**：kebab-case 小写英文（如 `model-quota`），目录名与之一致。
- **源码格式**：`host.js` / `client.js` 存的是 `cordis_define` 里 `code.host` / `code.client` 的**原文**（一个 `return {...}` 的函数体），加载时直接复制进 `cordis_define` 即可。
- **依赖声明**：源码里的 `inject` 与 `manifest.json` 的 `requires` 必须一致。
- **凭据**：需要 API key 的插件在 `manifest.json` 的 `credentials` 里声明环境变量名，说明写进 README。
- **版本**：`manifest.json` 的 `version` 语义化；破坏性变更升主版本。

## 如何加载一个插件到 DSH

在 DSH 会话里对我说，例如：

> 把 `C:\Users\rocks\dsh-plugins\plugins\model-quota` 的插件加载进来

我会按仓库约定：读取 `manifest.json` + `host.js` + `client.js` → `cordis_define`（新插件用 `idPrefix` 取 manifest 里的前缀）→ `cordis_run` 激活。之后该插件即可用，直到 DSH 进程重启。

手动方式：在插件目录里执行

```powershell
Get-Content host.js -Raw   # 结果粘贴给 code.host
Get-Content client.js -Raw # 结果粘贴给 code.client
```

## 新增插件的步骤

1. 复制 `plugins/_template/` 为 `plugins/<plugin-id>/`
2. 填 `manifest.json`（id / name / purpose / idPrefix）
3. 写 `host.js`（或删掉不要的半）
4. 写 `client.js`（或删掉不要的半）
5. 写 `README.md`（用途、凭据、入口、变更记录）
6. 在 DSH 里按"如何加载"激活并验证
