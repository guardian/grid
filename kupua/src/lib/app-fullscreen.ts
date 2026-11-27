/** Whole-app fullscreen: the document element. Image fullscreen stacks on top of it. */
export function isAppFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenElement === document.documentElement;
}

/** The image-level fullscreen element, ignoring whole-app fullscreen underneath. */
export function imageFullscreenElement(): Element | null {
  const el = typeof document !== "undefined" ? document.fullscreenElement : null;
  return el === document.documentElement ? null : el;
}

type EscapeKeyboard = { lock(keys: string[]): Promise<void>; unlock(): void };

function lockAppFullscreenEscape(): void {
  const keyboard = (navigator as Navigator & { keyboard?: EscapeKeyboard }).keyboard;
  if (!keyboard?.lock || !isAppFullscreen()) return;

  let active = true;
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="menu"]')) return;
    event.preventDefault();
    // Short Escape leaves app chrome fullscreen; Chrome retains its long-Escape emergency exit.
    if (!event.repeat && imageFullscreenElement()) void document.exitFullscreen().catch(() => {});
  };
  const release = () => {
    if (!active) return;
    active = false;
    document.removeEventListener("keydown", handleEscape);
    document.removeEventListener("fullscreenchange", handleChange);
    keyboard.unlock();
  };
  const handleChange = () => {
    if (!document.fullscreenElement) release();
  };
  document.addEventListener("fullscreenchange", handleChange);
  void keyboard.lock(["Escape"]).then(() => {
    if (active) document.addEventListener("keydown", handleEscape);
  }).catch(release);
}

export function toggleAppFullscreen(): void {
  if (isAppFullscreen()) document.exitFullscreen().catch(() => {});
  else if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen().then(lockAppFullscreenEscape).catch(() => {});
  }
}
