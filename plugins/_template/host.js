// 官方规范：纯 JavaScript，无 TypeScript/JSX/import；硬依赖走 inject，可选服务用 ctx.get。
return {
  name: 'your-plugin-host',
  inject: [],
  apply(ctx) {
    // Host 半：文件/网络/命令/工具/RPC 都在这边。
    // 参考 plugins/model-quota/host.js。
    //
    // RPC（Client → Host，只传 JSON）：
    //   harness.handle('your/method', async (args) => ({ ok: true, data: null }))
    //
    // 模型工具（必须带 output.schema + render）：
    //   harness.registerTool(ctx, harness.defineTool({
    //     name: 'your_tool',
    //     description: '做什么，模型视角的描述。',
    //     parameters: { 参数名: { type: 'string', required: true } },
    //     output: {
    //       schema: { type: 'string' },
    //       render(_args, value) { return [{ type: 'text', text: value }] },
    //     },
    //     async execute(args) { return '结果' },
    //   }))
  },
}
