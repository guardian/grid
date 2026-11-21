// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { morphPhotoFit, morphRect, planZoomMorph, type MorphTile } from "./justified-zoom-morph";

const tile = (id: string, x: number, y: number, width: number, height: number): MorphTile => ({ id, x, y, width, height, protected: false });

describe("bounded zoom morph plan", () => {
  it("pairs local ordered slots, consumes every endpoint and collapses unmatched columns", () => {
    const source = [tile("a", 0, 0, 90, 120), tile("b", 92, 0, 90, 120), tile("c", 184, 0, 116, 120)];
    const destination = [tile("d", 0, 0, 149, 160), tile("e", 151, 0, 149, 160)];
    const tracks = planZoomMorph(source, destination, 40, 10)!;
    expect(tracks).toHaveLength(3);
    expect(tracks.map(track => track.from.width)).toEqual([90, 90, 116]);
    expect(tracks.map(track => track.to.width)).toEqual([149, 149, 0]);
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const boxes = tracks.map(track => morphRect(track, p));
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
      expect(boxes.at(-1)!.x + boxes.at(-1)!.width).toBeCloseTo(300);
    }
  });

  it("pairs rows about the anchor and keeps ordered row boundaries through births", () => {
    const source = [tile("a", 0, -102, 200, 100), tile("b", 0, 0, 200, 100), tile("c", 0, 102, 200, 100)];
    const destination = [tile("d", 0, 0, 200, 130), tile("e", 0, 132, 200, 130)];
    const tracks = planZoomMorph(source, destination, 40, 10)!;
    expect(tracks[1].from.y).toBe(0);
    expect(tracks[1].to.y).toBe(0);
    expect(tracks[0].to.height).toBe(0);
    for (const p of [0, 0.2, 0.5, 1]) {
      const boxes = tracks.map(track => morphRect(track, p));
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height);
    }
  });

  it("retains one image for a same-identity slot and does not mutate inputs", () => {
    const image = document.createElement("img");
    const source = [{ ...tile("a", 0, 0, 100, 100), image }];
    const destination = [{ ...tile("a", 0, 0, 200, 200), image: document.createElement("img") }];
    const tracks = planZoomMorph(source, destination, 40, 10)!;
    expect(tracks[0].incoming).toBe(image);
    expect(tracks[0].outgoing).toBe(image);
    expect(source[0].width).toBe(100);
    expect(morphRect(tracks[0], -1)).toEqual(tracks[0].from);
    expect(morphRect(tracks[0], 2)).toEqual(tracks[0].to);
  });

  it("keeps the pinned image on one identity track across a row break", () => {
    const image = document.createElement("img");
    const source = [tile("a", 0, 0, 100, 100), { ...tile("pinned", 104, 0, 100, 100), image }];
    const destination = [tile("a", 0, -120, 200, 200), { ...tile("pinned", 0, -35, 200, 200), image }];
    const tracks = planZoomMorph(source, destination, 35, 10, "pinned")!;
    const pinned = tracks.filter(track => track.outgoing === image || track.incoming === image);
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toMatchObject({ outgoing: image, incoming: image, from: source[1], to: destination[1] });
    for (const progress of [0, 0.5, 1]) {
      const box = morphRect(pinned[0], progress);
      expect(box.y + box.height * 0.35).toBeCloseTo(35);
    }
  });

  it("rejects protected inputs, bad geometry and over-budget plans", () => {
    const source = [tile("a", 0, 0, 100, 100)];
    expect(planZoomMorph(source, source, 0, 0)).toBeUndefined();
    expect(planZoomMorph([], source, 0, 10)).toBeUndefined();
    expect(planZoomMorph([{ ...source[0], protected: true }], source, 0, 10)).toBeUndefined();
    expect(planZoomMorph([{ ...source[0], width: NaN }], source, 0, 10)).toBeUndefined();
  });
});

describe("undistorted photo fitting", () => {
  it("lands on contain at both endpoints and uses cover in the middle", () => {
    expect(morphPhotoFit(400, 200, 100, 100, 0)).toMatchObject({ x: 0, y: 25, width: 100, height: 50 });
    expect(morphPhotoFit(400, 200, 100, 100, 0.5)).toMatchObject({ x: -50, y: 0, width: 200, height: 100 });
    expect(morphPhotoFit(400, 200, 100, 100, 1)).toMatchObject({ x: 0, y: 25, width: 100, height: 50 });
  });

  it("preserves aspect through changing clip ratios and has finite degenerate endpoints", () => {
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const fit = morphPhotoFit(103, 271, 20 + p * 600, 500 - p * 400, p);
      expect(fit.width / fit.height).toBeCloseTo(103 / 271);
      expect(Number.isFinite(fit.scale)).toBe(true);
    }
    expect(morphPhotoFit(100, 100, 0, 100, 0).scale).toBe(0);
    expect(morphPhotoFit(0, 100, 100, 100, 0).scale).toBe(0);
  });
});
