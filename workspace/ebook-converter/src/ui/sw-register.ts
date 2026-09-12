// 注册 Service Worker（离线可用）。失败不影响正常使用。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* 离线 / file:// 等环境忽略 */
    });
  });
}
