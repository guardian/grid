export function ProgressGlyph({ className, size = 18 }: { className?: string; size?: number }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle className="upload-progress-arc" r="9" pathLength="100" transform="translate(12 12) rotate(-95) scale(1 -1)" />
  </svg>;
}