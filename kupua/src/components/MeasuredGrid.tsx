import { useMemo } from "react";
import { create } from "zustand";
import { ImageGrid, type ImageGridProps } from "./ImageGrid";
import { imageRatio } from "@/lib/result-geometry";
import type { Image } from "@/types/image";
import type { MeasuredCells } from "@/hooks/useMeasuredLayout";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";

export const useMeasuredPrototype = create<{
  enabled: boolean; fields: ReadonlySet<string>; drafts: ReadonlyMap<string, string>;
  setDraft: (id: string, value: string) => void;
}>(set => ({ enabled: false, fields: new Set(["note", "extra"]), drafts: new Map(),
  setDraft: (id, value) => set(state => ({ drafts: new Map(state.drafts).set(id, value) })),
}));

if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.assign(window, { __kupua_measured__: {
    enable: (enabled = true) => { useMeasuredPrototype.setState({ enabled }); useUiPrefsStore.getState().setDensity("justified"); },
    draft: (id: string, value: string) => useMeasuredPrototype.getState().setDraft(id, value),
    field: (key: string, visible: boolean) => useMeasuredPrototype.setState(state => {
      const fields = new Set(state.fields);
      if (visible) fields.add(key); else fields.delete(key);
      return { fields };
    }),
  } });
}

function Fields({ image }: { image: Image }) {
  const fields = useMeasuredPrototype(state => state.fields);
  const draft = useMeasuredPrototype(state => state.drafts.get(image.id) ?? "");
  const variation = [...image.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 7;
  return <div className="p-3 space-y-3 cursor-text" onClick={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()} onDragStart={event => event.stopPropagation()}>
    {fields.has("note") && <label data-measured-field="note" className="block text-sm">
      Note
      <textarea aria-label="Prototype note" value={draft} rows={1}
        className="block w-full bg-grid-bg border border-grid-border p-2 leading-6 resize-y"
        style={{ fieldSizing: "content" }}
        onChange={event => useMeasuredPrototype.getState().setDraft(image.id, event.target.value)} />
    </label>}
    {fields.has("extra") && <div data-measured-field="extra" className="text-sm leading-6 break-words">
      {Array.from({ length: 8 + variation * 13 }, () => "Example field value.").join(" ")}
    </div>}
  </div>;
}

const thumbnailHeight = (image: Image, width: number) => Math.min(180, Math.max(1, width) / imageRatio(image));

export function MeasuredGrid(props: Pick<ImageGridProps, "handleRange">) {
  const fields = useMeasuredPrototype(state => state.fields);
  const cells = useMemo<MeasuredCells>(() => ({
    key: [...fields].sort().join(","), thumbnailHeight,
    estimate: (image, width) => (image ? thumbnailHeight(image, width) : 180) + 28 + fields.size * 90,
    render: image => <Fields image={image} />,
  }), [fields]);
  return <ImageGrid {...props} measuredCells={cells} />;
}