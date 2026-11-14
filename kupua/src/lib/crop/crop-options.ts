/**
 * Crop ratios and Kahuna's legacy crop URL parameters.
 *
 * Mirrors kahuna/public/js/util/constants/cropOptions.js and util/crop.js. Kahuna
 * does not read media-api's /configuration/crop-variations; neither do we.
 *
 * Integrations (e.g. Composer) open Grid with `cropType`, `customRatio` and
 * `defaultCropType` on any route. Kahuna stores them in sessionStorage so the
 * restriction persists for the tab; kupua does the same under its own keys.
 */

export interface CropOption {
  key: string;
  /** width / height; null for freeform. */
  ratio: number | null;
  /** Sent to the cropper service as `aspectRatio`; undefined for freeform. */
  ratioString?: string;
  isHidden?: boolean;
}

export const FREEFORM: CropOption = { key: "freeform", ratio: null };
export const SQUARE_KEY = "square";

export const BUILT_IN_CROP_OPTIONS: readonly CropOption[] = [
  { key: "landscape OLD", ratio: 5 / 3, ratioString: "5:3", isHidden: true },
  { key: "landscape", ratio: 5 / 4, ratioString: "5:4" },
  { key: "portrait", ratio: 4 / 5, ratioString: "4:5" },
  { key: "video", ratio: 16 / 9, ratioString: "16:9" },
  { key: SQUARE_KEY, ratio: 1, ratioString: "1:1" },
  FREEFORM,
];

export const DEFAULT_CROP_KEY = FREEFORM.key;

const STORAGE_PREFIX = "kupua.crop.";
const CROP_TYPE_KEY = `${STORAGE_PREFIX}cropType`;
const CUSTOM_CROP_KEY = `${STORAGE_PREFIX}customCrop`;
const DEFAULT_TYPE_KEY = `${STORAGE_PREFIX}defaultCropType`;
const listeners = new Set<() => void>();
let revision = 0;

export function subscribeCropSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCropSettingsRevision(): number {
  return revision;
}

function sessionCropStorage(): Storage | undefined {
  try { return sessionStorage; } catch { return undefined; }
}

export const LEGACY_CROP_PARAM_KEYS = ["cropType", "customRatio", "defaultCropType"] as const;

/** Parses Kahuna's `label,x,y` custom ratio (e.g. `longcrop,1,5`). */
export function parseCustomRatio(value: string): CropOption | undefined {
  const parts = value.split(",");
  const [label, x, y] = parts;
  if (parts.length !== 3 || !label?.trim() || !/^\d+$/.test(x) || !/^\d+$/.test(y)) return undefined;
  const xr = Number(x);
  const yr = Number(y);
  if (!Number.isSafeInteger(xr) || !Number.isSafeInteger(yr) || xr <= 0 || yr <= 0) return undefined;
  return { key: label, ratio: xr / yr, ratioString: `${xr}:${yr}` };
}

function read(storage: Storage | undefined, key: string): string | undefined {
  try {
    return storage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(storage: Storage | undefined, key: string, value: string | undefined): void {
  try {
    if (value === undefined) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage unavailable: the restriction simply does not persist.
  }
}

export function getCropOptions(storage: Storage | undefined = sessionCropStorage()): CropOption[] {
  const custom = read(storage, CUSTOM_CROP_KEY);
  const parsed = custom ? parseCustomRatio(custom) : undefined;
  return parsed ? [...BUILT_IN_CROP_OPTIONS, parsed] : [...BUILT_IN_CROP_OPTIONS];
}

function validKey(value: string | null | undefined, options: CropOption[]): string | undefined {
  return value && options.some((o) => o.key === value) ? value : undefined;
}

/**
 * Applies Kahuna's crop params in its order: custom ratio first (a crop type may
 * name it), then crop type, then default. An invalid value clears its setting.
 */
export function applyLegacyCropParams(params: URLSearchParams, storage: Storage | undefined = sessionCropStorage()): void {
  const keys = [CUSTOM_CROP_KEY, CROP_TYPE_KEY, DEFAULT_TYPE_KEY];
  const previous = keys.map(key => read(storage, key));
  const customRatio = params.get("customRatio");
  if (customRatio) write(storage, CUSTOM_CROP_KEY, parseCustomRatio(customRatio) ? customRatio : undefined);
  const options = getCropOptions(storage);
  const cropType = params.get("cropType");
  if (cropType) write(storage, CROP_TYPE_KEY, validKey(cropType, options));
  const defaultCropType = params.get("defaultCropType");
  if (defaultCropType) write(storage, DEFAULT_TYPE_KEY, validKey(defaultCropType, options));
  if (keys.some((key, index) => read(storage, key) !== previous[index])) {
    revision++;
    listeners.forEach(listener => listener());
  }
}

export interface CropSettings {
  /** Selectable options; a locked type (integration restriction) is the only one. */
  options: CropOption[];
  lockedType?: string;
  initialType: string;
}

export function allowsCropRatio(settings: CropSettings, aspectRatio: unknown): boolean {
  return settings.lockedType === undefined || aspectRatio === settings.options[0]?.ratioString;
}

export function getCropSettings(storage: Storage | undefined = sessionCropStorage()): CropSettings {
  const all = getCropOptions(storage);
  const lockedType = validKey(read(storage, CROP_TYPE_KEY), all);
  const defaultType = validKey(read(storage, DEFAULT_TYPE_KEY), all);
  return {
    options: lockedType ? all.filter((o) => o.key === lockedType) : all.filter((o) => !o.isHidden || o.key === defaultType),
    lockedType,
    initialType: lockedType ?? defaultType ?? DEFAULT_CROP_KEY,
  };
}
