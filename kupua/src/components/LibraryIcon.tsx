const frame = "M113.8 113.8H14.1V14.2h25V0H14.2C6.4 0 0 6.4 0 14.2v99.6c0 7.8 6.4 14.2 14.2 14.2h99.6c7.8 0 14.2-6.4 14.2-14.2V90.3h-14.2v23.5z";
const lockedFrame = "M113.8 98.7v15.1H14.1V14.2h42.7V0H14.2C6.4 0 0 6.4 0 14.2v99.6c0 7.8 6.4 14.2 14.2 14.2h99.6c7.8 0 14.2-6.4 14.2-14.2V98.7h-14.2z";
const symbols = {
  add: "M119 0H65c-5 0-9 4-9 9v54c0 5 4 9 9 9h54c5 0 9-4 9-9V9c0-5-4.1-9-9-9zm-.8 42.6H98.5v19.6H85.4V42.6H65.8V29.5h19.6V9.8h13.1v19.6h19.6v13.2z",
  added: "M119 0H65c-5 0-9 4-9 9v54c0 5 4 9 9 9h54c5 0 9-4 9-9V9c0-5-4-9-9-9zM62 58.4l19.3-32 15 24.1L107 34.4l15 24H62z",
  remove: "M119 0H65c-5 0-9 4-9 9v54c0 5 4 9 9 9h54c5 0 9-4 9-9V9c0-4.9-4-9-9-9zm-.8 42.6H65.8V29.5h52.4v13.1z",
  locked: "M67.7 88.6H118c4.6 0 8.4-3.8 8.4-8.4V38.3c0-4.6-3.8-8.4-8.4-8.4h-4.2v-8.4c0-11.5-9.4-20.9-21-20.9s-21 9.4-21 20.9v8.4h-4.2c-4.6 0-8.4 3.8-8.4 8.4v41.9c.1 4.6 3.9 8.4 8.5 8.4zM92.8 70C86.9 70 82 65.2 82 59.2c0-5.9 4.9-10.8 10.8-10.8s10.8 4.9 10.8 10.8c0 6-4.8 10.8-10.8 10.8zM79.9 21.5c0-7.2 5.8-13 13-13s13 5.8 13 13v8.4h-26v-8.4z",
};

export function libraryStatusIcon(reasons: readonly string[]) {
  return reasons.length === 1 && reasons[0] === "archived" ? "added" : "locked";
}

export function LibraryIcon({ variant, size = 16, className }: { variant: keyof typeof symbols; size?: number; className?: string }) {
  return <svg data-library-icon={variant} aria-hidden="true" viewBox="0 0 128 128" fill="currentColor" width={size} height={size} className={className}>
    <path d={variant === "locked" ? lockedFrame : frame} /><path d={symbols[variant]} />
  </svg>;
}