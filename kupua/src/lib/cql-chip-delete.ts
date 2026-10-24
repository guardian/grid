interface ComposedPathEvent {
  composedPath(): EventTarget[];
}

export function isCqlChipDeleteEvent(event: ComposedPathEvent): boolean {
  return event.composedPath().some(
    (target) => target instanceof Element
      && target.classList.contains("Cql__ChipWrapperDeleteHandle"),
  );
}