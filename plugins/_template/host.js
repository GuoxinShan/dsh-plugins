return {
  name: 'your-plugin-host',
  inject: [],
  apply(ctx) {
    // Host 半：文件/网络/命令/工具/RPC 都在这边。
    // 参考 plugins/model-quota/host.js。
    // harness.handle('your/method', async (args) => ({ ok: true }))
    // harness.registerTool(ctx, harness.defineTool({ ... }))
  },
}
