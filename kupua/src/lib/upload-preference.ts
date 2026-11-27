export const UPLOAD_PREFERENCE_KEY = "kupua-allow-uploads";

export function readUploadPreference(): boolean {
  try { return localStorage.getItem(UPLOAD_PREFERENCE_KEY) === "true"; }
  catch { return false; }
}

export function saveUploadPreference(allowed: boolean): boolean {
  try { localStorage.setItem(UPLOAD_PREFERENCE_KEY, String(allowed)); return true; }
  catch { return false; }
}

export const uploadsAllowedAtStartup = readUploadPreference();