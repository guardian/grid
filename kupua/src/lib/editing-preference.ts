export const EDITING_PREFERENCE_KEY = "kupua-allow-editing";

export function readEditingPreference(): boolean {
  try { return localStorage.getItem(EDITING_PREFERENCE_KEY) === "true"; }
  catch { return false; }
}

export function saveEditingPreference(allowed: boolean): boolean {
  try { localStorage.setItem(EDITING_PREFERENCE_KEY, String(allowed)); return true; }
  catch { return false; }
}

export const editingAllowedAtStartup = readEditingPreference();