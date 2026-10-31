/** Whole-app fullscreen: the document element. Image fullscreen stacks on top of it. */
export function isAppFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenElement === document.documentElement;
}

/** The image-level fullscreen element, ignoring whole-app fullscreen underneath. */
export function imageFullscreenElement(): Element | null {
  const el = typeof document !== "undefined" ? document.fullscreenElement : null;
  return el === document.documentElement ? null : el;
}

export function toggleAppFullscreen(): void {
  if (isAppFullscreen()) document.exitFullscreen().catch(() => {});
  else if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
}
