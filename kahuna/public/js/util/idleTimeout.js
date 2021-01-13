export const idleTimeout = (f) => {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(() => { f(); });
  }
  return window.setTimeout(() => { f(); }, 100);
};
