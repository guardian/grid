/**
 * DateFilter — a single dropdown button for date range filtering.
 *
 * Mirrors kahuna's `gu-date-range` component:
 * - Field selector: Upload time / Date taken / Last modified
 * - Preset buttons: Anytime, Today, Past 24 hours, Past week, Past 6 months, Past year
 * - Two date inputs (From / To) for custom ranges
 * - Cancel / Filter footer
 *
 * When collapsed, shows:
 * - "Anytime" + calendar icon when no date filter is set
 * - A summary label + accent dot indicator when a filter is active
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import {
  startOfToday,
  subHours,
  subDays,
  subMonths,
  subYears,
  format,
  parseISO,
} from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

type DateFieldKey = "uploaded" | "taken" | "modified";

interface FieldOption {
  label: string;
  key: DateFieldKey;
  /** Value written to the `dateField` URL param (undefined = uploaded, the default) */
  urlValue: string | undefined;
}

interface PresetOption {
  label: string;
  /** ISO date string for the "since" bound, or undefined for "Anytime" (clear) */
  value: string | undefined;
}

// ── Constants ──────────────────────────────────────────────────────────────

const FIELD_OPTIONS: FieldOption[] = [
  { label: "Upload time", key: "uploaded", urlValue: undefined },
  { label: "Date taken", key: "taken", urlValue: "taken" },
  { label: "Last modified", key: "modified", urlValue: "modified" },
];

function makePresets(): PresetOption[] {
  return [
    { label: "Anytime", value: undefined },
    { label: "Today", value: startOfToday().toISOString() },
    { label: "Past 24 hours", value: subHours(new Date(), 24).toISOString() },
    { label: "Past week", value: subDays(new Date(), 7).toISOString() },
    { label: "Past 6 months", value: subMonths(new Date(), 6).toISOString() },
    { label: "Past year", value: subYears(new Date(), 1).toISOString() },
  ];
}

/**
 * Determine which preset (if any) matches a stored `since` value.
 *
 * "Today" uses exact comparison (startOfToday is stable within a day).
 * Relative presets ("Past 24 hours", "Past week", …) drift every second,
 * so we allow a tolerance window — the stored value was computed at click
 * time and may be minutes/hours old. We check in order and return the
 * first match so that "Today" (exact) is never confused with "Past 24
 * hours" (tolerance).
 */
function findMatchingPreset(
  since: string | undefined,
  until: string | undefined,
  presets: PresetOption[],
): string | undefined {
  // A preset only sets `since` — if `until` is set it's a custom range.
  if (until) return undefined;
  if (!since) return "Anytime";

  const sinceMs = new Date(since).getTime();
  if (isNaN(sinceMs)) return undefined;

  // 2-hour tolerance — generous enough to survive leaving a tab open for a
  // while, but far smaller than the gap between adjacent presets (24h → 7d).
  const TOLERANCE_MS = 2 * 60 * 60 * 1000;

  for (const preset of presets) {
    if (preset.value === undefined) continue; // skip "Anytime"
    const presetMs = new Date(preset.value).getTime();
    if (preset.label === "Today") {
      // Today = startOfToday — a fixed value. Exact match only.
      if (sinceMs === presetMs) return preset.label;
    } else {
      // Relative preset — allow tolerance for clock drift since click time.
      if (Math.abs(sinceMs - presetMs) <= TOLERANCE_MS) return preset.label;
    }
  }
  return undefined;
}

// ── Calendar icon (Material Icons "event" — inline SVG) ────────────────────

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      height="16"
      width="16"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read the active since/until from URL params based on the dateField */
function getActiveDateRange(params: Record<string, string | undefined>): {
  field: DateFieldKey;
  since: string | undefined;
  until: string | undefined;
} {
  const df = params.dateField;
  if (df === "taken") {
    return {
      field: "taken",
      since: params.takenSince,
      until: params.takenUntil,
    };
  }
  if (df === "modified") {
    return {
      field: "modified",
      since: params.modifiedSince,
      until: params.modifiedUntil,
    };
  }
  // default = uploaded
  return { field: "uploaded", since: params.since, until: params.until };
}

/** Format an ISO date string to a short human-readable form */
function formatDateShort(iso: string): string {
  try {
    return format(parseISO(iso), "dd MMM yyyy");
  } catch {
    return iso.slice(0, 10);
  }
}

/** Convert ISO string to YYYY-MM-DD for <input type="date"> */
function toDateInputValue(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Short field labels for the collapsed button display */
const FIELD_SHORT_LABELS: Record<DateFieldKey, string> = {
  uploaded: "Uploaded",
  taken: "Taken",
  modified: "Modified",
};

/** Build a summary label for the button when a filter is active */
function buildButtonLabel(
  field: DateFieldKey,
  since?: string,
  until?: string
): string {
  const fieldLabel = FIELD_SHORT_LABELS[field];

  if (!since && !until) return "Anytime";

  const parts: string[] = [fieldLabel];
  if (since && until) {
    parts.push(`${formatDateShort(since)} — ${formatDateShort(until)}`);
  } else if (since) {
    parts.push(`from ${formatDateShort(since)}`);
  } else if (until) {
    parts.push(`until ${formatDateShort(until)}`);
  }
  return parts.join(": ");
}

// ── Component ──────────────────────────────────────────────────────────────

export function DateFilter() {
  const params = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Local (draft) state — only committed to URL on "Filter" click
  const active = getActiveDateRange(params);
  const [draftField, setDraftField] = useState<DateFieldKey>(active.field);
  const [draftSince, setDraftSince] = useState<string | undefined>(
    active.since
  );
  const [draftUntil, setDraftUntil] = useState<string | undefined>(
    active.until
  );

  // Sync draft state when URL changes (e.g. back/forward navigation)
  useEffect(() => {
    const a = getActiveDateRange(params);
    setDraftField(a.field);
    setDraftSince(a.since);
    setDraftUntil(a.until);
  }, [
    params.dateField,
    params.since,
    params.until,
    params.takenSince,
    params.takenUntil,
    params.modifiedSince,
    params.modifiedUntil,
  ]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        // Reset draft to current URL state and close
        const a = getActiveDateRange(params);
        setDraftField(a.field);
        setDraftSince(a.since);
        setDraftUntil(a.until);
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, params]);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const a = getActiveDateRange(params);
        setDraftField(a.field);
        setDraftSince(a.since);
        setDraftUntil(a.until);
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, params]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const applyDateFilter = useCallback(
    (
      field: DateFieldKey,
      since: string | undefined,
      until: string | undefined
    ) => {
      const fieldUrlValue = FIELD_OPTIONS.find(
        (f) => f.key === field
      )?.urlValue;
      updateSearch({
        dateField: fieldUrlValue,
        since: field === "uploaded" ? since : undefined,
        until: field === "uploaded" ? until : undefined,
        takenSince: field === "taken" ? since : undefined,
        takenUntil: field === "taken" ? until : undefined,
        modifiedSince: field === "modified" ? since : undefined,
        modifiedUntil: field === "modified" ? until : undefined,
      });
    },
    [updateSearch]
  );

  const handlePreset = useCallback(
    (preset: PresetOption) => {
      // Presets only set "since" (from that moment to now); "until" is cleared
      setDraftSince(preset.value);
      setDraftUntil(undefined);

      if (preset.value === undefined) {
        // "Anytime" — clear everything, reset field to default, and close
        setDraftField("uploaded");
        updateSearch({
          dateField: undefined,
          since: undefined,
          until: undefined,
          takenSince: undefined,
          takenUntil: undefined,
          modifiedSince: undefined,
          modifiedUntil: undefined,
        });
        setOpen(false);
        return;
      }

      // Apply preset immediately (same as kahuna)
      applyDateFilter(draftField, preset.value, undefined);
      setOpen(false);
    },
    [draftField, updateSearch, applyDateFilter]
  );

  const handleSave = useCallback(() => {
    applyDateFilter(draftField, draftSince, draftUntil);
    setOpen(false);
  }, [applyDateFilter, draftField, draftSince, draftUntil]);

  const handleCancel = useCallback(() => {
    // Reset draft to current URL state
    const a = getActiveDateRange(params);
    setDraftField(a.field);
    setDraftSince(a.since);
    setDraftUntil(a.until);
    setOpen(false);
  }, [params]);

  const handleFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setDraftSince(value ? new Date(value + "T00:00:00").toISOString() : undefined);
    },
    []
  );

  const handleToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setDraftUntil(
        value
          ? new Date(value + "T23:59:59.999").toISOString()
          : undefined
      );
    },
    []
  );

  const handleClearFrom = useCallback(() => {
    setDraftSince(undefined);
  }, []);

  const handleClearTo = useCallback(() => {
    setDraftUntil(undefined);
  }, []);

  // ── Derived state ────────────────────────────────────────────────────

  const isActive = !!(active.since || active.until);
  const buttonLabel = buildButtonLabel(active.field, active.since, active.until);
  const presets = makePresets();
  const matchedPreset = findMatchingPreset(draftSince, draftUntil, presets);

  // Check if draft state differs from URL state (to disable Filter button when unchanged)
  const draftMatchesUrl =
    draftField === active.field &&
    draftSince === active.since &&
    draftUntil === active.until;

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`relative flex items-center gap-1.5 px-2 py-1 rounded text-sm border transition-colors cursor-pointer select-none whitespace-nowrap border-grid-border hover:text-grid-text-bright hover:border-grid-text-muted ${
          open
            ? "text-grid-text-bright border-grid-text-muted"
            : "text-grid-text-muted"
        }`}
        aria-label={open ? "Hide date range filter" : "Show date range filter"}
      >
        <CalendarIcon className="w-4 h-4 shrink-0" />
        <span>{buttonLabel}</span>
        {/* Chevron — matches the native <select> dropdown arrow */}
        <svg className="w-3 h-3 shrink-0 ml-0.5" viewBox="0 0 12 12" fill="currentColor">
          <path d={open ? "M3 8l3-3 3 3" : "M3 4l3 3 3-3"} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Non-default indicator — positioned as a badge to avoid layout shift */}
        {isActive && (
          <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-grid-accent" />
        )}
      </button>

      {/* Dropdown overlay */}
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-grid-bg border border-grid-border rounded shadow-lg w-80 p-4">
          {/* Field selector */}
          <h3 className="text-sm font-bold text-grid-text-bright mb-2">
            Field
          </h3>
          <div className="flex gap-4 mb-4">
            {FIELD_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center gap-1.5 text-sm text-grid-text cursor-pointer"
              >
                <input
                  type="radio"
                  name="date-field"
                  checked={draftField === opt.key}
                  onChange={() => setDraftField(opt.key)}
                  className="accent-grid-accent w-3.5 h-3.5"
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* Preset buttons */}
          <h3 className="text-sm font-bold text-grid-text-bright mb-2">
            Presets
          </h3>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {presets.map((preset) => {
              const isPresetActive = preset.label === matchedPreset;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={[
                    "px-2.5 py-1 text-sm rounded border transition-colors cursor-pointer",
                    isPresetActive
                      ? "border-grid-accent bg-grid-accent/15 text-grid-text-bright"
                      : "border-grid-border text-grid-text hover:text-grid-text-bright hover:border-grid-text-muted hover:bg-grid-hover",
                  ].join(" ")}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Date pickers (From / To) */}
          <div className="flex gap-6 mb-4">
            {/* From */}
            <div className="flex-1">
              <h3 className="text-sm font-bold text-grid-text-bright mb-1.5">
                From
              </h3>
              <input
                type="date"
                value={toDateInputValue(draftSince)}
                max={toDateInputValue(draftUntil)}
                onChange={handleFromChange}
                className="w-full px-2 py-1 bg-grid-bg border border-grid-border rounded text-sm text-grid-text focus:outline-none focus:border-grid-accent [color-scheme:dark]"
              />
              <button
                type="button"
                onClick={handleClearFrom}
                className="mt-1 text-sm text-grid-text-muted hover:text-grid-text cursor-pointer"
              >
                Clear
              </button>
            </div>

            {/* To */}
            <div className="flex-1">
              <h3 className="text-sm font-bold text-grid-text-bright mb-1.5">
                To
              </h3>
              <input
                type="date"
                value={toDateInputValue(draftUntil)}
                min={toDateInputValue(draftSince)}
                onChange={handleToChange}
                className="w-full px-2 py-1 bg-grid-bg border border-grid-border rounded text-sm text-grid-text focus:outline-none focus:border-grid-accent [color-scheme:dark]"
              />
              <button
                type="button"
                onClick={handleClearTo}
                className="mt-1 text-sm text-grid-text-muted hover:text-grid-text cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1 text-sm text-grid-text-muted hover:text-grid-text cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={draftMatchesUrl}
              className={[
                "px-3 py-1 text-sm rounded transition-colors cursor-pointer",
                draftMatchesUrl
                  ? "bg-grid-accent/30 text-white/40 cursor-not-allowed"
                  : "bg-grid-accent text-white hover:bg-grid-accent-hover",
              ].join(" ")}
            >
              Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


