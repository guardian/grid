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
  prev: { points: "15 18 9 12 15 6", nudge: "-translate-x-px", side: "left-0 top-0" },
  // Next starts below the fullscreen corner button.
  next: { points: "9 6 15 12 9 18", nudge: "translate-x-px", side: "right-0 top-16" },
} as const;

export const FULLSCREEN_ICON = "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z";
export const FULLSCREEN_EXIT_ICON = "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z";

/** Top-right corner toggle, revealed on hover like the nav chevrons. */
export function FullscreenCornerButton({ isFullscreen, onClick, className }: { isFullscreen: boolean; onClick: () => void; className?: string }) {
  const label = isFullscreen ? "Exit full screen" : "Full screen";
  return (
    <button
      onClick={onClick}
      tabIndex={-1}
      className={`group absolute right-0 top-0 z-10 w-16 h-16 items-center justify-center cursor-pointer outline-none${className ? " " + className : " flex"}`}
      title={`${label} (f)`}
      aria-label={label}
    >
      <div className="w-13 h-13 flex items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 group-hover:opacity-100 group-hover:delay-100 transition-opacity duration-150">
        <svg className="w-6.5 h-6.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={isFullscreen ? FULLSCREEN_EXIT_ICON : FULLSCREEN_ICON} />
        </svg>
      </div>
    </button>
  );
}

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
      className={`group absolute ${side} bottom-0 z-10 w-16 items-center justify-center cursor-pointer outline-none${className ? " " + className : " flex"}`}
      title={`${label} (${key})`}
      aria-label={label}
    >
      {/* Reveal on hover (mouse). Hidden on mobile — swipe replaces buttons. */}
      <div className="w-13 h-13 flex items-center justify-center rounded-full bg-black/40 text-white/80 opacity-0 group-hover:opacity-100 group-hover:delay-100 transition-opacity duration-150">
        <svg
          className={`w-6.5 h-6.5 ${nudge}`}
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

