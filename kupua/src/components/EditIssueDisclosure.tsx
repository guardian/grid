import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MetadataSave } from "@/stores/metadata-editor-store";
import { labelStepStatus, sessionStopReason } from "@/lib/metadata-edit-execution";
import { StatusIcon } from "./UploadProgress";
import { Chevron } from "./Chevron";

export function editIssue(imageId: string, field: string, item?: MetadataSave["items"][number], missingNotSent = false) {
  const result = item?.result;
  const notSaved = item ? ["not-started", "queued", "stopped", "rejected"].includes(item.state) || result?.outcome === "blocked" : missingNotSent;
  const reload = item?.reloadRequired === true || sessionStopReason(result) === "reload-required";
  const steps = labelStepStatus(result);
  return { imageId, field, notSaved, reload, ...(steps && { steps }) };
}
export type EditIssue = ReturnType<typeof editIssue>;

export function createLabelIssueIndex() {
  type Group = { owners: number; issues: Map<string, EditIssue> };
  const byLabel = new Map<string, Group>();
  return {
    apply(labels: readonly string[], updates: ReadonlyMap<string, EditIssue | null>) {
      if (!updates.size) return;
      const touched = new Map<Group | undefined, string[]>();
      for (const label of new Set(labels)) {
        const group = byLabel.get(label), members = touched.get(group);
        if (members) members.push(label); else touched.set(group, [label]);
      }
      for (const [prior, members] of touched) {
        const shared = prior && prior.owners !== members.length;
        const group = prior && !shared ? prior : { owners: members.length, issues: new Map(prior?.issues) };
        if (shared) prior.owners -= members.length;
        for (const [id, issue] of updates) {
          if (issue) group.issues.set(id, issue); else group.issues.delete(id);
        }
        for (const label of members) {
          if (group.issues.size) byLabel.set(label, group); else byLabel.delete(label);
        }
      }
    },
    details() {
      const unique = new Set<EditIssue>();
      for (const group of new Set(byLabel.values())) for (const issue of group.issues.values()) unique.add(issue);
      return [...unique];
    },
  };
}

export function EditIssueDisclosure({ issues, count, compact, below, onSelect }: { issues: readonly EditIssue[]; count: number; compact: boolean; below: boolean; onSelect?: () => void }) {
  const popId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placedBelow, setPlacedBelow] = useState(below);
  const lines = useMemo(() => {
    const fields = new Map<string, Map<string, boolean>>();
    const stepGroups = new Map<string, Set<string>>();
    for (const issue of issues) {
      if (issue.steps) {
        const images = stepGroups.get(issue.steps) ?? new Set<string>();
        images.add(issue.imageId);
        stepGroups.set(issue.steps, images);
        continue;
      }
      const images = fields.get(issue.field) ?? new Map<string, boolean>();
      images.set(issue.imageId, issue.notSaved && images.get(issue.imageId) !== false);
      fields.set(issue.field, images);
    }
    return [...fields].map(([field, images]) => {
      const notSaved = [...images.values()].filter(Boolean).length;
      return { field, reasons: [notSaved && `${notSaved.toLocaleString()} not saved`, images.size > notSaved && `${(images.size - notSaved).toLocaleString()} not confirmed`].filter(Boolean).join(" · "), mixed: notSaved > 0 && notSaved < images.size };
    }).concat([...stepGroups].map(([steps, images]) => ({ field: `Label changes (${images.size} ${images.size === 1 ? "image" : "images"})`,
      reasons: `${steps}${images.size > 1 ? " per image" : ""}`, mixed: false })));
  }, [issues]);
  const reload = issues.some(issue => issue.reload);
  const summary = lines.map(line => `${line.field}: ${line.reasons}`).concat(reload ? ["Reload page"] : []).join("\n");
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect(), panel = popup.current!;
      const above = rect.top - 8, under = innerHeight - rect.bottom - 8;
      const down = below ? under >= panel.scrollHeight || under >= above : !(above >= panel.scrollHeight || above >= under);
      panel.style.maxHeight = `${Math.max(0, down ? under : above)}px`;
      panel.style.left = `${Math.max(4, Math.min(innerWidth - panel.offsetWidth - 4, rect.left))}px`;
      panel.style.top = `${down ? rect.bottom + 3 : rect.top - panel.offsetHeight - 3}px`;
      setPlacedBelow(down);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, below, summary]);
  const text = `${count.toLocaleString()} ${count === 1 ? "issue" : "issues"}`;
  return <span className="inline-flex shrink-0 items-center text-sm">
    <button ref={trigger} type="button" popoverTarget={popId} aria-expanded={open} aria-controls={popId} title={summary}
      className={`inline-flex items-center gap-1 whitespace-nowrap ${compact ? "h-11 touch-none" : "px-1"}`}>
      <span className="text-grid-warning"><StatusIcon status="error" /></span>{text}<Chevron direction={(open ? !placedBelow : below) ? "down" : "up"} className="size-3" />
    </button>
    <div ref={popup} id={popId} popover="auto" onToggle={event => setOpen(event.newState === "open")} className="fixed m-0 max-w-[calc(100vw-8px)] overflow-y-auto rounded border border-grid-separator bg-grid-bg px-3 py-2 text-sm text-grid-text shadow-lg">
      {lines.map(({field, reasons, mixed}) => <p key={field + reasons}><strong>{field}</strong>{mixed ? <br /> : ": "}{reasons}</p>)}
      {reload && <p>Reload page</p>}
      {onSelect && <button type="button" className="upload-link pointer-coarse:min-h-11" onClick={() => { popup.current?.hidePopover?.(); onSelect(); }}>{count === 1 ? "Select only this image" : `Select only these ${count.toLocaleString()}`}</button>}
    </div>
  </span>;
}