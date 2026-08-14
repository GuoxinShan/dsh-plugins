// 官方规范：纯 JavaScript + React.createElement；硬依赖走 inject；RPC 走 host.call（JSON）。
return {
  name: 'your-plugin-ui',
  inject: [],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    // Client 半：浏览器 UI。
    // styles.insert(`.cls { ... }`) 注入本插件样式（用 --dsw-* 主题变量）。
    // host.call('your/method', {}) 调宿主 RPC。
    // 槽位注册（先查询目标槽位契约再注册；tool.view.cordis 固定 key: 'self'）：
    //   slots.inject('目标槽位名', () => slots.register(
    //     { name: '目标槽位名', id: 'xxx' },
    //     (props) => React.createElement('div', null, 'Hello'),
    //   ))
  },
}
