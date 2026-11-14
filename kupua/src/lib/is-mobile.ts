/**
 * isMobile — compact phone-model detection.
 *
 * Used to suppress autofocus behaviours that would summon the on-screen
 * keyboard and obscure half the UI. Uses the shared shell decision rather
 * than changing desktop behavior merely because touch is available.
 */
import { isCompactNow } from "@/hooks/useShell";

export function isMobile(): boolean {
  return isCompactNow();
}
