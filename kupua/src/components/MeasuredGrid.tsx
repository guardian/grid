import { useMemo } from "react";
import { create } from "zustand";
import { ImageGrid, type ImageGridProps } from "./ImageGrid";
import { imageRatio } from "@/lib/result-geometry";
import type { Image } from "@/types/image";
import type { MeasuredCells } from "@/hooks/useMeasuredLayout";
import { useUiPrefsStore } from "@/stores/ui-prefs-store";
import { DETAIL_PANEL_FIELDS } from "@/lib/field-registry";
import { ImageMetadata } from "./ImageMetadata";
import { useMetadataDrafts } from "@/stores/metadata-drafts-store";

export const useFormFields = create<{ fields: ReadonlySet<string> }>(() => ({
  fields: new Set(DETAIL_PANEL_FIELDS.map(field => field.id)),
}));

if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.assign(window, { __kupua_form__: {
    enable: () => useUiPrefsStore.setState({ density: "form" }),
    draft: (id: string, value: string) => useMetadataDrafts.getState().setDraft(id, "metadata_description", "", value),
    field: (key: string, visible: boolean) => useFormFields.setState(state => {
      const fields = new Set(state.fields);
      if (visible) fields.add(key); else fields.delete(key);
      return { fields };
    }),
  } });
}

const thumbnailHeight = (image: Image, width: number) => Math.min(256, Math.min(256, Math.max(1, width - 24)) / imageRatio(image));

export function MeasuredGrid(props: Pick<ImageGridProps, "handleRange">) {
  const fields = useFormFields(state => state.fields);
  const cells = useMemo<MeasuredCells>(() => ({
    key: [...fields].sort().join(","), thumbnailHeight,
    estimate: (_image, width) => (width < 680 ? 256 : 0) + 600,
    render: (image, thumbnail) => <div className="form-density-item">
      <div data-measured-field="image" className="min-w-0 self-start">
        {thumbnail}
        <p className="px-3 py-2 text-xs text-grid-text-muted wrap-anywhere select-text">{image.uploadInfo?.filename ?? image.id}</p>
      </div>
      <div data-form-content className="min-w-0 p-3 cursor-text select-text"
        onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
        onDragStart={event => event.stopPropagation()}>
        <ImageMetadata image={image} formFields={fields} />
      </div>
    </div>,
  }), [fields]);
  return <ImageGrid {...props} measuredCells={cells} />;
}