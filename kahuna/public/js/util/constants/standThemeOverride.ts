import { semanticColors } from "@guardian/stand";

export const standThemeOverride = {
  link: {
    shared: {
      enabled: { color: semanticColors.border.focused },
      hover: { color: semanticColors.border.selectedInverse },
      pressed: { color: semanticColors.border.selectedInverse }
    }
  },
  typography: {
    default: { color: semanticColors.text.strongInverse },
    secondary: { color: semanticColors.text.weakInverse },
    disabled: { color: semanticColors.text.disabled }
  },
  background: { backgroundColor: semanticColors.bg.raisedLevel1Inverse }
};

/**
 * Kahuna's global stylesheet sets `html { font-size: 62.5% }` (10px) so that its own
 * rem-based CSS resolves as intended (e.g. `1.6rem` = 16px). @guardian/stand's design
 * tokens use `rem` assuming the standard 16px browser root, and `rem` always resolves
 * against the document's <html> element (never a wrapping container), so anything
 * rendered with Stand components inside Kahuna renders at 62.5% of its intended size.
 *
 * `zoom` rescales an entire subtree (text, padding, spacing - Stand uses rem for all
 * of these) back up to the intended size, without touching Kahuna's global font-size.
 */
export const standRootFontSizeCompensation = 16 / 10;
