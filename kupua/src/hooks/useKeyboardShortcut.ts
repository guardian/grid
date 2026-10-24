/**
 * React hook for registering a keyboard shortcut.
 *
 * Wraps `registerShortcut` from `lib/keyboard-shortcuts.ts` with automatic
 * cleanup on unmount. The shortcut follows the universal pattern:
 *   - Bare key when focus is not in an editable field
 *   - Alt+key when focus is in an editable field
 *
 * Usage:
 *   useKeyboardShortcut("[", () => togglePanel("left"));
 *   useKeyboardShortcut("f", toggleFullscreen);
 */

import { useEffect, useRef } from "react";
import { registerShortcut, type Shortcut } from "@/lib/keyboard-shortcuts";

/**
 * Register a keyboard shortcut for the lifetime of the calling component.
 *
 * The `action` callback is stored in a ref so the hook has a stable identity
 * and doesn't re-register on every render. The shortcut is unregistered
 * automatically when the component unmounts.
 *
 * Stack semantics: if two mounted components register the same key, the
 * most recently mounted one wins. Unmounting restores the previous handler.
 */
export function useKeyboardShortcut(key: string, action: () => void): void {
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    const shortcut: Shortcut = {
      key,
      action: () => actionRef.current(),
    };
    return registerShortcut(shortcut);
  }, [key]);
}

