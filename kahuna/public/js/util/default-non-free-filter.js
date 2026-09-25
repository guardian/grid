// Short-lived hand-off between a logo click and the next SearchQueryCtrl digest.
// It lives in sessionStorage, so it must expire on a wall-clock deadline rather
// than a $timeout, which a page reload or a busy digest would never run.
const GRACE_PERIOD_MS = 1500;

export const DEFAULT_NON_FREE_FILTER_KEY = 'defaultNonFreeFilter';

export function armedDefaultNonFreeFilter(isNonFree) {
  return {isDefault: true, isNonFree, expiresAt: Date.now() + GRACE_PERIOD_MS};
}

export function disarmedDefaultNonFreeFilter(isNonFree) {
  return {isDefault: false, isNonFree};
}

export function isDefaultNonFreeFilterArmed(filter) {
  return Boolean(filter) && filter.isDefault === true && Date.now() <= filter.expiresAt;
}
