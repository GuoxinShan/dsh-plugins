return {
  name: 'your-plugin-ui',
  inject: [],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    // Client 半：浏览器 UI。React.createElement 构建元素，styles.insert 插入样式。
    // host.call('your/method', {}) 调宿主 RPC。
    // slots.inject('目标槽位', () => slots.register({ name: '目标槽位', id: 'xxx' }, (props) => React.createElement('div', null, 'Hello')))
  },
}
