import { HOME_HREF } from "@/lib/home-defaults";
import { pressFeedback } from "@/lib/dom-utils";

interface DetailNavigationProps {
  destination: "image" | "search";
  onBack: () => void;
  onHome?: () => void;
}

export function DetailNavigation({ destination, onBack, onHome }: DetailNavigationProps) {
  return (
    <div className="detail-navigation flex items-center shrink-0 -ml-3">
      <a
        {...pressFeedback}
        href={HOME_HREF}
        title={"Grid \u2014 clear all filters"}
        className="detail-home tap-feedback shrink-0 w-11 h-11 flex items-center justify-center hover:bg-grid-hover transition-colors"
        onClick={onHome ? (event) => { event.preventDefault(); onHome(); } : undefined}
      >
        <img src={`${import.meta.env.BASE_URL}images/grid-logo.svg`} alt="Grid" className="w-8 h-8" />
      </a>
      <div className="w-px h-5 bg-grid-separator shrink-0" />
      <button
        onClick={onBack}
        aria-label={`Back to ${destination}`}
        title={`Back to ${destination}`}
        className="detail-back shrink-0 min-w-11 h-11 flex items-center justify-center gap-1.5 px-3 text-sm text-grid-text-muted hover:bg-grid-hover hover:text-grid-text transition-colors cursor-pointer"
      >
        <svg className="size-[1.05rem] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        <span className="hidden @min-[360px]/detail-toolbar:inline whitespace-nowrap">
          Back<span className="hidden @min-[640px]/detail-toolbar:inline"> to {destination}</span>
        </span>
      </button>
    </div>
  );
}