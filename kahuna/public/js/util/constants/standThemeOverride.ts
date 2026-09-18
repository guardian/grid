import { semanticColors } from "@guardian/stand";
import { type LinkTheme } from "@guardian/stand/Link";
import { type SelectTheme } from "@guardian/stand/Select";
import { type ButtonTheme } from "@guardian/stand/Button";
import { type FormInputContainerTheme } from "@guardian/stand/dist/components/Form/styles";
import { type TypographyTheme } from "@guardian/stand/Typography";
import { DeepPartial } from "@guardian/stand/dist/util/types";

const typographyThemeOverrides: Record<
  "default" | "secondary" | "disabled" | "error",
  TypographyTheme
> = {
  default: { color: semanticColors.text.strongInverse },
  secondary: { color: semanticColors.text.weakInverse },
  disabled: { color: semanticColors.text.disabled },
  error: { color: semanticColors.text.error }
};

const linkTheme: LinkTheme = {
  shared: {
    enabled: { color: semanticColors.border.focused },
    hover: { color: semanticColors.border.selectedInverse },
    pressed: { color: semanticColors.border.selectedInverse }
  }
};

const selectTheme: SelectTheme = {
  shared: {
    button: {
      color: semanticColors.text.strongInverse,
      backgroundColor: semanticColors.bg.raisedLevel1Inverse,
      border: `1px solid ${semanticColors.border.weak}`
    },
    hover: {
      backgroundColor: semanticColors.bg.raisedLevel2Inverse
    },
    pressed: {
      backgroundColor: semanticColors.bg.raisedLevel1Inverse
    },
    option: {
      focused: {
        backgroundColor: semanticColors.bg.raisedLevel2Inverse
      }
    },
    listBox: {
      backgroundColor: semanticColors.bg.raisedLevel1Inverse
    }
  }
};

const formInputContainerTheme: DeepPartial<FormInputContainerTheme> = {
  shared: {
    label: { color: semanticColors.text.strongInverse }
  }
};

const buttonThemeOverrides: Record<"destructive" | "tertiary", ButtonTheme> = {
  destructive: {
    primary: {
      shared: {
        color: semanticColors.text.strongerInverse,
        backgroundColor: semanticColors.fill.errorStrong,
        border: `1px solid ${semanticColors.fill.errorStrong}`,
        hover: {
          backgroundColor: semanticColors.text.error,
          border: `1px solid ${semanticColors.text.error}`
        },
        active: {
          backgroundColor: semanticColors.text.red,
          border: `1px solid ${semanticColors.text.red}`
        }
      }
    }
  },
  tertiary: {
    tertiary: {
      shared: {
        color: semanticColors.text.strongInverse,
        backgroundColor: "none",
        border: `1px solid ${semanticColors.border.weak}`,
        hover: {
          backgroundColor: semanticColors.bg.raisedLevel2Inverse,
          border: `1px solid ${semanticColors.border.weak}`
        },
        active: {
          backgroundColor: semanticColors.bg.raisedLevel1Inverse,
          border: `1px solid ${semanticColors.border.weak}`
        }
      }
    }
  }
};

export const standThemeOverride = {
  background: { backgroundColor: semanticColors.bg.raisedLevel1Inverse },
  typography: typographyThemeOverrides,
  link: linkTheme,
  select: selectTheme,
  formInputContainer: formInputContainerTheme,
  button: {
    destructive: buttonThemeOverrides.destructive,
    tertiary: buttonThemeOverrides.tertiary
  }
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
