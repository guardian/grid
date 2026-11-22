import { useId, useLayoutEffect, useRef, useState } from "react";
import { Chevron } from "./Chevron";

export function RightsCreatorInput({ label, value, options, required, className, onChange }: {
  label: string; value: string; options: readonly string[]; required: boolean; className: string; onChange: (value: string) => void;
}) {
  const id = useId(), listId = `${id}-options`;
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"closed" | "all" | "filtered">("closed");
  const [index, setIndex] = useState(0);
  const matches = mode === "all" ? options : options.filter(option => option.toLowerCase().includes(value.toLowerCase()));
  const open = mode !== "closed" && matches.length > 0 && !(mode === "filtered" && matches.length === 1 && matches[0] === value);
  const active = Math.min(index, matches.length - 1);
  const filter = () => { setMode("filtered"); setIndex(0); };
  const choose = (option: string) => { onChange(option); setMode("closed"); };
  useLayoutEffect(() => {
    const box = list.current, row = box?.children[active] as HTMLElement | undefined;
    if (!box || !row || !open) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [active, open, mode, value]);
  return <div onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMode("closed"); }}>
    <label htmlFor={id}>{label}</label>
    <span className="rights-required metadata-field-status" aria-hidden="true">Required</span>
    <div className="rights-combobox">
      <input ref={input} id={id} className={className} role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${listId}-${active}` : undefined}
        autoComplete="off" placeholder="Select from the list or type a name" required={required} value={value}
        onFocus={filter} onClick={filter} onChange={event => { onChange(event.target.value); filter(); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setMode("closed"); }
          else if (event.key === "Enter" && open) { event.preventDefault(); event.stopPropagation(); choose(matches[active]); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); event.stopPropagation();
            if (!open) { setMode("all"); setIndex(Math.max(0, options.indexOf(value))); }
            else setIndex((active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
          } else if (event.key === "Tab") setMode("closed");
        }} />
      <button type="button" className="rights-creator-toggle" aria-label="Show all options" aria-haspopup="listbox" aria-expanded={open}
        onMouseDown={event => event.preventDefault()} onClick={() => {
          input.current?.focus(); setMode(open ? "closed" : "all"); setIndex(Math.max(0, options.indexOf(value)));
        }}><Chevron direction="down" /></button>
      {open && <div className="rights-creator-options" ref={list} id={listId} role="listbox" aria-label={label}>
        {matches.map((option, position) => <div key={`${position}-${option}`} role="option" id={`${listId}-${position}`} aria-selected={position === active}
          onMouseDown={event => event.preventDefault()} onMouseMove={() => setIndex(position)} onClick={() => choose(option)}>{option}</div>)}
      </div>}
    </div>
  </div>;
}