import { useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from "react";
import { format, isValid, parse, parseISO } from "date-fns";

const DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS";
const SEGMENTS = [
  { key: "day", label: "Day", length: 2, hint: "DD", separator: "/" },
  { key: "month", label: "Month", length: 2, hint: "MM", separator: "/" },
  { key: "year", label: "Year", length: 4, hint: "YYYY", separator: " " },
  { key: "hours", label: "Hours", length: 2, hint: "hh", separator: ":" },
  { key: "minutes", label: "Minutes", length: 2, hint: "mm", separator: ":" },
  { key: "seconds", label: "Seconds", length: 2, hint: "ss", separator: "." },
  { key: "fraction", label: "Milliseconds", length: 3, hint: "SSS", separator: "" },
] as const;
type Part = typeof SEGMENTS[number]["key"];
type Parts = Record<Part, string>;
const emptyParts = (): Parts => ({ day: "", month: "", year: "", hours: "", minutes: "", seconds: "", fraction: "" });

function dateParts(value: string): Parts {
  if (!value) return emptyParts();
  const date = parse(value, DATE_FORMAT, new Date(2000, 0, 1));
  if (!isValid(date)) return emptyParts();
  return {
    day: format(date, "dd"), month: format(date, "MM"), year: format(date, "yyyy"),
    hours: format(date, "HH"), minutes: format(date, "mm"), seconds: format(date, "ss"), fraction: format(date, "SSS"),
  };
}

function dateValue(parts: Parts): string | null {
  if (SEGMENTS.every(segment => !parts[segment.key])) return "";
  if (parts.year.length !== 4 || SEGMENTS.some(segment => segment.key !== "fraction" && !parts[segment.key])) return null;
  const value = `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}T${parts.hours.padStart(2, "0")}:${parts.minutes.padStart(2, "0")}:${parts.seconds.padStart(2, "0")}.${parts.fraction.padStart(3, "0")}`;
  const date = parse(value, DATE_FORMAT, new Date(2000, 0, 1));
  return isValid(date) && format(date, DATE_FORMAT) === value ? value : null;
}

export interface MetadataDateInputHandle {
  clear: () => void;
}

export function MetadataDateInput({ initialValue, mixed, validationId, onChange, ref }: {
  initialValue: string;
  mixed: boolean;
  validationId: string;
  onChange: (value: string, valid: boolean) => void;
  ref?: Ref<MetadataDateInputHandle>;
}) {
  const [parts, setParts] = useState(() => dateParts(initialValue));
  const [showMixed, setShowMixed] = useState(mixed && !initialValue);
  const [selectedAll, setSelectedAll] = useState(false);
  const [calendarUnavailable, setCalendarUnavailable] = useState(false);
  const mixedButton = useRef<HTMLButtonElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const value = dateValue(parts);
  const valid = value !== null;
  useLayoutEffect(() => {
    if (showMixed) {
      mixedButton.current?.focus();
    } else {
      inputs.current[0]?.focus();
      inputs.current[0]?.select();
    }
  }, [showMixed]);
  const update = (next: Parts) => {
    setParts(next);
    setShowMixed(false);
    setSelectedAll(false);
    setCalendarUnavailable(false);
    const draft = dateValue(next);
    onChange(draft ?? "", draft !== null);
  };
  const clear = () => update(emptyParts());
  useImperativeHandle(ref, () => ({ clear }));
  const focusPart = (index: number) => {
    const input = inputs.current[index];
    input?.focus();
    input?.select();
  };
  const changePart = (key: Part, input: string, index: number) => {
    const digits = input.replace(/\D/g, "").slice(0, SEGMENTS[index].length);
    const next = { ...parts, [key]: digits };
    if (key !== "fraction") {
      const hasDateOrTime = SEGMENTS.some(segment => segment.key !== "fraction" && next[segment.key]);
      next.fraction = hasDateOrTime ? "000" : "";
      const draft = dateValue(next);
      const restoredOriginalSecond = initialValue && draft && draft.slice(0, 19) === initialValue.slice(0, 19);
      if (restoredOriginalSecond) next.fraction = dateParts(initialValue).fraction;
    }
    update(next);
    if (digits.length === SEGMENTS[index].length && index < SEGMENTS.length - 1) focusPart(index + 1);
  };
  const segmentKey = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      event.stopPropagation();
      setSelectedAll(true);
      return;
    }
    if (selectedAll && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault();
      event.stopPropagation();
      clear();
      return;
    }
    if (selectedAll && /^\d$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      update({ ...emptyParts(), day: event.key, fraction: "000" });
      focusPart(0);
      return;
    }
    setSelectedAll(false);
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const input = event.currentTarget;
    const movePrevious = (event.key === "ArrowLeft" && input.selectionStart === 0)
      || (event.key === "Backspace" && !input.value);
    const moveNext = event.key === "ArrowRight" && input.selectionEnd === input.value.length;
    const canMove = (movePrevious && index > 0) || (moveNext && index < SEGMENTS.length - 1);
    if (canMove) {
      event.preventDefault();
      event.stopPropagation();
      focusPart(index + (movePrevious ? -1 : 1));
    }
  };
  const openCalendar = () => {
    setCalendarUnavailable(false);
    const input = picker.current;
    if (!input?.showPicker) {
      setCalendarUnavailable(true);
      return;
    }
    try { input.showPicker(); }
    catch { setCalendarUnavailable(true); }
  };
  const changeCalendar = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (!input.validity.valid) return;
    if (!input.value) {
      clear();
      return;
    }
    const chosen = parseISO(input.value);
    if (!isValid(chosen)) return;
    const chosenSecond = format(chosen, "yyyy-MM-dd'T'HH:mm:ss");
    const restoredOriginalSecond = initialValue && chosenSecond === initialValue.slice(0, 19);
    update(dateParts(restoredOriginalSecond ? initialValue : `${chosenSecond}.000`));
  };
  return <>
    <div className="metadata-date-entry">
      <div className="metadata-date-segments" role="group" aria-label="Taken on" aria-invalid={!valid || undefined}
        aria-describedby={!valid ? validationId : undefined} data-mixed={showMixed || undefined}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSelectedAll(false); }}>
        {showMixed ? <button ref={mixedButton} type="button" className="metadata-date-placeholder"
          onClick={() => setShowMixed(false)}>Multiple dates</button> : SEGMENTS.map((segment, index) => <span key={segment.key} className={`metadata-date-part metadata-date-${segment.key}`}>
          <input ref={element => { inputs.current[index] = element; }} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
            aria-label={segment.label} title={segment.label} placeholder={segment.hint} maxLength={segment.length}
            aria-invalid={!valid || undefined} aria-describedby={!valid ? validationId : undefined}
            data-selected={selectedAll || undefined} value={parts[segment.key]}
            onPointerDown={() => setSelectedAll(false)}
            onFocus={event => event.currentTarget.select()} onChange={event => changePart(segment.key, event.target.value, index)}
            onKeyDown={event => segmentKey(event, index)} />
          {segment.separator && <span className="metadata-date-separator" aria-hidden="true">{segment.separator}</span>}
        </span>)}
      </div>
      <span className="metadata-date-picker">
        <button type="button" className="metadata-edit-tool metadata-date-calendar" aria-label="Choose date and time" title="Choose date and time"
          onClick={openCalendar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" /></svg>
        </button>
        <input ref={picker} className="metadata-date-picker-input" type="datetime-local" step="1" tabIndex={-1}
          aria-label="Taken on calendar" value={value ? value.slice(0, 19) : ""}
          onChange={changeCalendar} />
      </span>
    </div>
    {calendarUnavailable && <p role="status" className="mt-1 text-xs text-grid-text-muted">Calendar unavailable.</p>}
  </>;
}