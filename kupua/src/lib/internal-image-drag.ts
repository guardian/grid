const marker = "application/x-kupua-image-drag";
let active: { token: string; ids: readonly string[]; signal: AbortSignal; clear: () => void } | undefined;
const listeners = new Set<() => void>();

export const activeImageDrag = () => active?.signal;
export function subscribeImageDrag(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function beginImageDrag(source: Element, transfer: DataTransfer, ids: readonly string[]) {
  active?.clear();
  const token = crypto.getRandomValues(new Uint32Array(4)).join("-");
  const lifetime = new AbortController();
  transfer.setData(marker, token);
  const clear = () => {
    source.removeEventListener("dragend", clear);
    active = undefined;
    lifetime.abort();
    listeners.forEach(listener => listener());
  };
  active = { token, ids: [...ids], signal: lifetime.signal, clear };
  source.addEventListener("dragend", clear);
  listeners.forEach(listener => listener());
}

export function hasImageDrag(transfer: DataTransfer) {
  return !!active && transfer.types.includes(marker);
}

export function imageDragSignal(transfer: DataTransfer) {
  return hasImageDrag(transfer) ? active?.signal : undefined;
}

export function takeImageDrag(transfer: DataTransfer) {
  if (!active || transfer.getData(marker) !== active.token) return;
  const { ids, clear } = active;
  clear();
  return ids;
}