import { describe, expect, it, vi } from "vitest";
import { readGridDragCrops, writeGridImageDragData } from "./grid-drag-data";
import * as discovery from "./grid-api-instance";
import type { Image } from "@/types/image";

describe("Grid external drag", () => {
  it("reads a saved crop through the fixed LOCAL route only after matching discovery", async () => {
    const origin = "https://cropper.media.local.dev-gutools.co.uk";
    const uri = "https://api.example.test/images/example";
    const crop = { id: "saved", specification: { uri }, master: {}, assets: [{ dimensions: { width: 20, height: 10 } }] };
    const resource = { uri, crops: `${origin}/crops/example`, data: { id: "example", exports: [crop] } } as unknown as NonNullable<Image["__dragResource"]>;
    const link = vi.spyOn(discovery, "serviceLink").mockResolvedValue("https://other.example.test");
    const fetchCrop = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ data: [crop], links: [{ rel: "image", href: uri }] }));
    const signal = new AbortController().signal;
    try {
      expect(await readGridDragCrops(resource, signal)).toBeUndefined();
      expect(fetchCrop).not.toHaveBeenCalled();
      link.mockResolvedValue(origin);
      expect((await readGridDragCrops(resource, signal))?.get("saved")).toMatchObject(crop);
      expect(fetchCrop).toHaveBeenCalledWith("/grid-local-cropper/crops/example", expect.objectContaining({ signal, redirect: "error" }));
    } finally {
      fetchCrop.mockRestore();
      link.mockRestore();
    }
  });

  it("writes the returned entity, native UI route and additional singleton selection", () => {
    const uri = "https://api.example.test/images/example";
    const ui = "https://grid.example.test/images/example";
    const data = { id: "example", thumbnail: { file: "https://example.test/thumb" }, usages: { data: [] } };
    const image = { id: data.id, __dragResource: { data, uri, ui } } as unknown as Image;
    const entries = new Map<string, string>();
    expect(writeGridImageDragData({ setData: entries.set.bind(entries) }, image, { selected: true })).toBe(true);
    expect(JSON.parse(entries.get("application/vnd.mediaservice.image+json")!)).toEqual({ data, uri });
    expect(JSON.parse(entries.get("application/vnd.mediaservice.images+json")!)).toEqual([{ data }]);
    expect(entries.get("text/uri-list")).toBe(uri);
    expect(entries.get("text/plain")).toBe(uri);
    expect(entries.get("application/vnd.mediaservice.kahuna.uri")).toBe(ui);
    expect(JSON.parse(entries.get("application/vnd.asset-handle+json")!)).toEqual({ source: "grid", sourceType: "original", thumbnail: data.thumbnail.file, embeddableUrl: ui });
  });
});