/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockDataSource } from "@/dal/mock-data-source";
import { RECONCILE_FIELDS } from "@/lib/field-registry";
import { recomputeAll } from "@/lib/reconcile";
import type { Image } from "@/types/image";
import { MultiImageMetadata } from "./MultiImageMetadata";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  return { updateSearch: vi.fn(), cancelDebounce: vi.fn() };
});
vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({ query: "credit:Reuters" }) }));
vi.mock("@/hooks/useUrlSearchSync", () => ({ useUpdateSearchParams: () => fixture.updateSearch }));
vi.mock("@/lib/orchestration/search", () => ({ cancelSearchDebounce: fixture.cancelDebounce }));

const partialKeywords = Array.from({ length: 25 }, (_, i) => `partial-${i}`);
let images: Image[];
let frames: FrameRequestCallback[];

function fieldRow(label: string) {
  return screen.getByText(label, { selector: "dt" }).parentElement!;
}

beforeEach(async () => {
  vi.clearAllMocks();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const base = await new MockDataSource(2).getByIds(["img-0", "img-1"]);
  images = base.map((image, i) => ({
    ...image,
    metadata: { ...image.metadata, keywords: i === 0 ? [...partialKeywords, "shared"] : ["shared"] },
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("multi-image Location punctuation", () => {
  it("keeps commas with preceding values outside search links and omits empty segments", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("location_subLocation", { kind: "all-same", value: "Venue", count: 2 });
    view.set("location_city", { kind: "all-same", value: "City", count: 2 });
    view.set("location_state", { kind: "all-empty", count: 2 });
    view.set("location_country", { kind: "all-same", value: "Country", count: 2 });
    render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    const row = fieldRow("Location");
    const groups = row.querySelectorAll(".inline-flex");
    expect(row.querySelector("dd")?.textContent).toBe("Venue, City, Country");
    expect(Array.from(groups, group => group.textContent)).toEqual(["Venue,", "City,", "Country"]);
    expect(within(row).getAllByRole("button").map(button => button.textContent)).toEqual(["Venue", "City", "Country"]);
    expect(groups[0].nextSibling?.textContent).toBe(" ");
  });
});

describe("multi-image chip disclosure", () => {
  it("mounts only the first 20 frequency-ordered values, not CSS-hidden remainder", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    const row = within(fieldRow("Keywords"));
    const pills = row.getAllByRole("button").filter(button => button.hasAttribute("title"));
    expect(pills).toHaveLength(20);
    expect(pills.map(button => button.textContent)).toEqual(["shared", ...partialKeywords.slice(0, 19)]);
    expect(row.queryByRole("button", { name: "partial-19" })).toBeNull();
    expect(row.getByRole("button", { name: "shared" }).getAttribute("title")).toContain("2/2");
    expect(row.getByRole("button", { name: "partial-0" }).getAttribute("title")).toContain("1/2");
    expect(view.get("keywords")).toMatchObject({ kind: "chip-array", total: 2, chips: expect.arrayContaining([{ value: "partial-24", count: 1 }]) });
  });

  it("reveals the exact complete union and full-selection counts, then unmounts the remainder without requests", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<MultiImageMetadata images={images} reconciledView={recomputeAll(images, RECONCILE_FIELDS)} total={2} />);
    const row = within(fieldRow("Keywords"));
    const toggle = row.getByRole("button", { name: "Show more…" });
    const values = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("Show fewer");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    const pills = within(values).getAllByRole("button");
    expect(pills.map(button => button.textContent)).toEqual(["shared", ...partialKeywords]);
    expect(pills[0].hasAttribute("data-partial")).toBe(false);
    expect(pills[0].className).toContain("bg-grid-cell-hover/60");
    for (const pill of pills.slice(1)) {
      expect(pill.getAttribute("data-partial")).toBe("true");
      expect(pill.getAttribute("title")).toContain("1/2");
    }
    fireEvent.click(toggle);
    frames.splice(0).forEach(callback => callback(0));
    expect(within(values).getAllByRole("button")).toHaveLength(20);
    expect(toggle.textContent).toBe("Show more…");
    expect(document.activeElement).toBe(toggle);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps fields independent and complete lists of 20 or fewer control-free", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("subjects", { kind: "chip-array", total: 2, chips: Array.from({ length: 20 }, (_, i) => ({ value: `subject-${i}`, count: 2 })) });
    view.set("people", { kind: "chip-array", total: 2, chips: Array.from({ length: 21 }, (_, i) => ({ value: `person-${i}`, count: 1 })) });
    view.set("labels", { kind: "chip-array", total: 2, chips: [{ value: "shared-label", count: 2 }, { value: "partial-label", count: 1 }] });
    render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    const subjects = within(fieldRow("Subjects"));
    const people = within(fieldRow("People"));
    const keywords = within(fieldRow("Keywords"));
    expect(subjects.getAllByRole("button")).toHaveLength(20);
    expect(subjects.queryByRole("button", { name: "Show more…" })).toBeNull();
    expect(within(fieldRow("Labels")).getByRole("button", { name: "shared-label" }).className).toContain("bg-grid-accent");
    expect(within(fieldRow("Labels")).queryByRole("button", { name: "Show more…" })).toBeNull();
    fireEvent.click(keywords.getByRole("button", { name: "Show more…" }));
    expect(keywords.getAllByRole("button").filter(button => button.hasAttribute("title"))).toHaveLength(26);
    expect(people.queryByRole("button", { name: "person-20" })).toBeNull();
    fireEvent.click(people.getByRole("button", { name: "Show more…" }));
    fireEvent.click(keywords.getByRole("button", { name: "Show fewer" }));
    expect(people.getByRole("button", { name: "person-20" })).toBeTruthy();
    expect(people.getByRole("button", { name: "Show fewer" })).toBeTruthy();
    expect(keywords.queryByRole("button", { name: "partial-24" })).toBeNull();
  });

  it("retains per-field expansion through refreshed and pending views with stable frequency ties", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    const { rerender } = render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    fireEvent.click(within(fieldRow("Keywords")).getByRole("button", { name: "Show more…" }));
    const pending = new Map(view);
    pending.set("keywords", { kind: "dirty" });
    rerender(<MultiImageMetadata images={images} reconciledView={pending} total={2} />);
    expect(within(fieldRow("Keywords")).queryByRole("button")).toBeNull();
    const empty = new Map(view);
    empty.set("keywords", { kind: "chip-array", chips: [], total: 2 });
    rerender(<MultiImageMetadata images={images} reconciledView={empty} total={2} />);
    expect(screen.queryByText("Keywords", { selector: "dt" })).toBeNull();
    expect(Array.from(document.querySelectorAll("dl > .border-b")).every(section => section.childElementCount > 0)).toBe(true);
    const refreshed = new Map(view);
    const chips = [{ value: "tie-first", count: 2 }, { value: "frequent", count: 3 }, { value: "tie-second", count: 2 }, ...partialKeywords.map(value => ({ value, count: 1 }))];
    refreshed.set("keywords", { kind: "chip-array", total: 3, chips });
    rerender(<MultiImageMetadata images={images} reconciledView={refreshed} total={3} />);
    const row = within(fieldRow("Keywords"));
    expect(row.getByRole("button", { name: "Show fewer" })).toBeTruthy();
    const pills = row.getAllByRole("button").filter(button => button.hasAttribute("title"));
    expect(pills.map(button => button.textContent)).toEqual(["frequent", "tie-first", "tie-second", ...partialKeywords]);
    expect(pills[0].getAttribute("title")).toContain("3/3");
    expect(pills[1].getAttribute("title")).toContain("2/3");
    expect(chips.slice(0, 3).map(chip => chip.value)).toEqual(["tie-first", "frequent", "tie-second"]);
  });

  it("preserves plain, Shift and Alt searches on values revealed by expansion", () => {
    render(<MultiImageMetadata images={images} reconciledView={recomputeAll(images, RECONCILE_FIELDS)} total={2} />);
    const row = within(fieldRow("Keywords"));
    fireEvent.click(row.getByRole("button", { name: "Show more…" }));
    const tail = row.getByRole("button", { name: "partial-24" });
    fireEvent.click(tail);
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "keyword:partial-24", image: undefined });
    fireEvent.click(tail, { shiftKey: true });
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "credit:Reuters keyword:partial-24", image: undefined });
    fireEvent.click(tail, { altKey: true });
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "credit:Reuters -keyword:partial-24", image: undefined });
  });

  it.each(["retained control", "removed control"] as const)("preserves newer focus before the collapse frame with a %s", (lifetime) => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    const { rerender } = render(<MultiImageMetadata images={images} reconciledView={view} total={2} />);
    fireEvent.click(within(fieldRow("Keywords")).getByRole("button", { name: "Show more…" }));
    if (lifetime === "removed control") {
      const short = new Map(view);
      short.set("keywords", { kind: "chip-array", total: 2, chips: [{ value: "shared", count: 2 }] });
      rerender(<MultiImageMetadata images={images} reconciledView={short} total={2} />);
    }
    const row = within(fieldRow("Keywords"));
    const toggle = row.getByRole("button", { name: "Show fewer" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.isConnected).toBe(lifetime === "retained control");
    const newerTarget = row.getByRole("button", { name: "shared" });
    newerTarget.focus();
    frames.splice(0).forEach(callback => callback(0));
    expect(document.activeElement).toBe(newerTarget);
  });

  it("anchors collapse after commit and preserves focus when a refreshed short list removes the control", () => {
    const view = recomputeAll(images, RECONCILE_FIELDS);
    const { rerender } = render(<div style={{ overflowY: "auto" }}><MultiImageMetadata images={images} reconciledView={view} total={2} /></div>);
    fireEvent.click(within(fieldRow("Keywords")).getByRole("button", { name: "Show more…" }));
    const short = new Map(view);
    short.set("keywords", { kind: "chip-array", total: 2, chips: [{ value: "shared", count: 2 }] });
    rerender(<div style={{ overflowY: "auto" }}><MultiImageMetadata images={images} reconciledView={short} total={2} /></div>);
    const header = fieldRow("Keywords");
    const scroller = header.closest("dl")!.parentElement!;
    scroller.scrollTop = 100;
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ top: 10 } as DOMRect);
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ top: 40 } as DOMRect);
    const toggle = within(header).getByRole("button", { name: "Show fewer" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.isConnected).toBe(false);
    expect(scroller.scrollTop).toBe(100);
    frames.splice(0).forEach(callback => callback(0));
    expect(scroller.scrollTop).toBe(130);
    expect(document.activeElement).toBe(header);
    expect(within(header).getAllByRole("button")).toHaveLength(1);
  });
});
