/**
 * CostBadge — visual indicator for image cost state.
 *
 * Replicates Kahuna's cost semantic colours exactly (muscle memory for editors).
 * Source colours verified from kahuna/public/stylesheets/main.css.
 *
 * Grid cell badges use Kahuna-matching icons (sm size):
 *   pay → £ symbol, red pill
 *   overquota → trending_up SVG, red pill
 *   no-rights → warning SVG, red pill
 *   conditional → flag SVG, orange pill
 *   free → hidden on grid cell (Kahuna shows no badge for free)
 *
 * Panel badges (md/lg) show text labels.
 *
 * See integration-workplan-bread-and-butter.md Cluster1.7 for replicate-vs-improve
 * decision: colours replicated 1:1, shape is a simple pill (no Kahuna cruft).
 */

import type { Cost } from "@/dal/grid-api/types";

export type CostVariant = Cost | "no-rights";

export interface CostBadgeProps {
  variant: CostVariant;
  size?: "sm" | "md" | "lg";
  /** Override the default tooltip. When provided, replaces VARIANT_LABELS[variant]. */
  tooltip?: string;
  /** When true, badge bg becomes teal (Kahuna's "leased" override). */
  leased?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Material Design SVG icons (24×24 viewBox, filled style)
// ---------------------------------------------------------------------------

function WarningIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

function TrendingUpIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
      <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
    </svg>
  );
}

function FlagIcon({ size = 14 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
      <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Badge content per variant and size
// ---------------------------------------------------------------------------

const VARIANT_LABELS: Record<CostVariant, string> = {
  free: "Free",
  pay: "Pay",
  conditional: "Conditional",
  overquota: "Overquota",
  "no-rights": "No rights",
};

/** Icon-only content for sm size (grid cell / table cell). Matches Kahuna exactly. */
const VARIANT_ICONS: Record<CostVariant, React.ReactNode> = {
  free: "✓",
  pay: "£",
  conditional: <FlagIcon />,
  overquota: <TrendingUpIcon />,
  "no-rights": <WarningIcon />,
};

/** Tailwind bg classes derived from the CSS custom properties in index.css */
const VARIANT_STYLE: Record<CostVariant, React.CSSProperties> = {
  free: { backgroundColor: "var(--color-grid-cost-free)" },
  pay: { backgroundColor: "var(--color-grid-cost-pay)" },
  conditional: { backgroundColor: "var(--color-grid-cost-conditional)" },
  overquota: { backgroundColor: "var(--color-grid-cost-overquota)" },
  "no-rights": { backgroundColor: "var(--color-grid-cost-no-rights)" },
};

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "text-2xs rounded font-semibold leading-none",
  md: "text-xs px-2 py-1 rounded font-semibold",
  lg: "text-sm px-2.5 py-1 rounded font-semibold",
};

/** Fixed dimensions for sm badges — wider than square to match Kahuna prominence. */
const SM_STYLE: React.CSSProperties = { width: 27, height: 18 };

// ---------------------------------------------------------------------------
// Dynamic tooltip (Kahuna-matching)
// ---------------------------------------------------------------------------

const VARIANT_TOOLTIPS: Record<CostVariant, string> = {
  free: "Free to use",
  pay: "Pay to use",
  conditional: "Restrictions apply",
  overquota: "Quota for images from this supplier has been exceeded!",
  "no-rights": "No current rights to use this image!",
};



/**
 * Build a dynamic tooltip for a cost badge.
 * Adds "Leased, but: " prefix when an active allow-use lease exists.
 * Adds restriction text for conditional variant.
 */
export function buildCostTooltip(
  variant: CostVariant,
  hasActiveAllowLease?: boolean,
  restrictions?: string,
): string {
  const prefix = hasActiveAllowLease ? "Leased, but: " : "";

  if (variant === "no-rights") return VARIANT_TOOLTIPS["no-rights"];

  if (variant === "conditional") {
    return restrictions
      ? `${prefix}Restrictions: ${restrictions}`
      : `${prefix}${VARIANT_TOOLTIPS.conditional}`;
  }

  return `${prefix}${VARIANT_TOOLTIPS[variant]}`;
}

const LEASED_STYLE: React.CSSProperties = { backgroundColor: "var(--color-grid-cost-leased)" };

export function CostBadge({
  variant,
  size = "sm",
  tooltip,
  leased,
  className,
  style,
  children,
}: CostBadgeProps) {
  // sm = icon-only (Kahuna grid cell style); md/lg = text label
  const label = children ?? (size === "sm" ? VARIANT_ICONS[variant] : VARIANT_LABELS[variant]);
  const bgStyle = leased && variant !== "no-rights" ? LEASED_STYLE : VARIANT_STYLE[variant];
  return (
    <span
      className={`inline-flex items-center justify-center text-white select-none ${SIZE_CLASSES[size]} ${className ?? ""}`}
      style={{ ...bgStyle, ...(size === "sm" ? SM_STYLE : undefined), ...style }}
      title={tooltip ?? VARIANT_TOOLTIPS[variant]}
    >
      {label}
    </span>
  );
}

/**
 * CostBadgeFromCost — convenience wrapper that accepts Cost | undefined.
 * Renders nothing when cost is undefined.
 * Treats empty-category usageRights (NoRights) as "no-rights" variant.
 */
export interface CostBadgeFromCostProps {
  cost: Cost | "no-rights" | undefined;
  noRights?: boolean;
  hasActiveAllowLease?: boolean;
  restrictions?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CostBadgeFromCost({ cost, noRights, hasActiveAllowLease, restrictions, size, className }: CostBadgeFromCostProps) {
  if (!cost && !noRights) return null;
  const variant: CostVariant = noRights ? "no-rights" : (cost as CostVariant);
  const tooltip = buildCostTooltip(variant, hasActiveAllowLease, restrictions);
  return <CostBadge variant={variant} size={size} className={className} tooltip={tooltip} leased={hasActiveAllowLease} />;
}
