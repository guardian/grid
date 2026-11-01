import { HOME_HREF } from "@/lib/home-defaults";

interface DetailNavigationProps {
  destination: "image" | "search";
  onBack: () => void;
  onHome?: () => void;
}

export function DetailNavigation({ destination, onBack, onHome }: DetailNavigationProps) {
  return (
    <div className="flex items-center shrink-0 -ml-3">
      <a
        href={HOME_HREF}
        title={"Grid \u2014 clear all filters"}
        className="shrink-0 w-11 h-11 flex items-center justify-center hover:bg-grid-hover transition-colors"
        onClick={onHome ? (event) => { event.preventDefault(); onHome(); } : undefined}
      >
        <img src={`${import.meta.env.BASE_URL}images/grid-logo.svg`} alt="Grid" className="w-8 h-8" />
      </a>
      <div className="w-px h-5 bg-grid-separator shrink-0" />
      <button
        onClick={onBack}
        className="shrink-0 h-11 flex items-center gap-1.5 px-3 text-sm text-grid-text-muted hover:bg-grid-hover hover:text-grid-text transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {destination === "search" ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></> : <path d="M19 12H5m6-6-6 6 6 6" />}
        </svg>
        Back to {destination}
      </button>
    </div>
  );
}