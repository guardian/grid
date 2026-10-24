/**
 * NavStrip — full-height hover zone for prev/next image navigation.
 *
 * Used in both ImageDetail and FullscreenPreview. A tall invisible strip
 * at the left or right edge of the image area; hovering anywhere on it
 * reveals a chevron button. Clicking or pressing the corresponding arrow
 * key navigates to the adjacent image.
 *
 * The chevron is optically centred (1px nudge in the arrow direction).
 */

interface NavStripProps {
  direction: "prev" | "next";
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Additional classes on the outer button (e.g. responsive visibility). */
  className?: string;
}

const CHEVRON = {
  prev: { points: "15 18 9 12 15 6", nudge: "-translate-x-px", side: "left-0" },
  next: { points: "9 6 15 12 9 18", nudge: "translate-x-px", side: "right-0" },
} as const;

export function NavStrip({ direction, onClick, onMouseEnter, onMouseLeave, className }: NavStripProps) {
  const { points, nudge, side } = CHEVRON[direction];
  const label = direction === "prev" ? "Previous image" : "Next image";
  const key = direction === "prev" ? "←" : "→";

  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      tabIndex={-1}
      className={`group absolute ${side} top-0 bottom-0 z-10 w-16 items-center justify-center cursor-pointer outline-none${className ? " " + className : " flex"}`}
      title={`${label} (${key})`}
      aria-label={label}
    >
      {/* Reveal on hover (mouse). Hidden on mobile — swipe replaces buttons. */}
      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <svg
          className={`w-5 h-5 ${nudge}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points={points} />
        </svg>
      </div>
    </button>
  );
}

