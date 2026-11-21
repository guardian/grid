export type Departure = "Discard edit" | "Discard and deselect" | "Discard and open";
type Guard = (action: Departure) => Promise<boolean>;
const guards = new Set<Guard>();

export function registerDetailsGuard(guard: Guard) {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

export function hasChangedDetails() { return guards.size > 0; }

export function allowDetailsDeparture(action: Departure): boolean | Promise<boolean> {
  const guard = [...guards].at(-1);
  return guard ? guard(action) : true;
}

export function afterDetailsDeparture(action: Departure, proceed: () => void) {
  const allowed = allowDetailsDeparture(action);
  if (allowed === true) proceed();
  else if (allowed !== false) void allowed.then(accepted => { if (accepted) proceed(); });
}