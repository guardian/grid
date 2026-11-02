// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMorphRenderer } from "./justified-zoom-morph-renderer";
import type { MorphTrack } from "./justified-zoom-morph";

function image() {
  const image = document.createElement("img");
  image.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'/>";
  return image;
}
function track(): MorphTrack {
  return { from: { x: 0, y: 0, width: 100, height: 100 }, to: { x: 10, y: 20, width: 200, height: 100 }, outgoing: image(), incoming: image() };
}
function readyImages() {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(100);
}
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("decorative DOM zoom renderer", () => {
  it("uses uniform photo transforms, opaque incoming surfaces and fixed DOM while scrubbing", () => {
    readyImages();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const renderer = createMorphRenderer(host, [track()], "rgb(20, 20, 20)")!;
    expect(renderer.ready()).toBe(true);
    renderer.draw(0);
    const outgoing = host.querySelector("img")!;
    expect(outgoing.style.transform).toBe("translate(0px, 25px) scale(0.5)");
    const nodes = host.querySelectorAll("*").length;
    const read = vi.spyOn(Element.prototype, "getBoundingClientRect");
    for (let i = 0; i < 100; i++) renderer.draw(i / 100);
    expect(host.querySelectorAll("*")).toHaveLength(nodes);
    expect(read).not.toHaveBeenCalled();
    expect(host.querySelectorAll("img")).toHaveLength(2);
    renderer.draw(0.5);
    expect((host.querySelectorAll("img")[1].parentElement as HTMLElement).style.opacity).toBe("0.5");
    renderer.dispose();
    expect(host.children).toHaveLength(0);
  });

  it("does not mutate borrowed image attributes or double identical content", () => {
    readyImages();
    const source = image();
    source.className = "w-full";
    const t = { ...track(), outgoing: source, incoming: source };
    const host = document.createElement("div");
    const renderer = createMorphRenderer(host, [t], "black")!;
    expect(host.querySelectorAll("img")).toHaveLength(1);
    expect(source.className).toBe("w-full");
    renderer.dispose();
    expect(source.src).not.toBe("");
  });

  it("declines unloaded sources without touching borrowed nodes", () => {
    const host = document.createElement("div");
    expect(createMorphRenderer(host, [track()], "black")).toBeUndefined();
    expect(host.children).toHaveLength(0);
  });
});
