export function Chevron({ direction, className = "size-4" }: { direction: "right" | "down" | "up"; className?: string }) {
  const paths = {
    right: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    down: "M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z",
    up: "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  };
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={paths[direction]} /></svg>;
}