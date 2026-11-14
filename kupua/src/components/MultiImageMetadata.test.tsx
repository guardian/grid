/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockDataSource } from "@/dal/mock-data-source";
import { RECONCILE_FIELDS } from "@/lib/field-registry";
import { recomputeAll } from "@/lib/reconcile";
import { gridConfig } from "@/lib/grid-config";
import { LOCATION_COMPONENTS, MetadataLocationEditor } from "./MetadataLocationEditor";
import type { Image } from "@/types/image";
import { MultiImageMetadata } from "./MultiImageMetadata";
import { ImageMetadata } from "./ImageMetadata";
import { LabelEditor, LabelEditorContext, LabelOperationReceipts } from "./LabelEditor";
import { createLabelEditorStore, labelTargetKey } from "@/stores/label-editor-store";
import { MetadataTextEditor } from "./MetadataTextEditor";
import { CostBadge, CostBadgeFromCost } from "./CostBadge";
import { useUsageRightsCatalogue } from "@/lib/usage-rights-catalogue";
import * as typeahead from "@/lib/typeahead-fields";
import type { GridCommandResult, LabelCommand } from "@/lib/grid-commands";
import { acceptEnrichedImage, attachEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { acceptImageOverlay, acceptObservedImages, admitLabelObservation, captureImageRead, recordImageAvailability, resetImageFreshnessForTests, stampImageRead } from "@/lib/image-read-freshness";

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
const configuredImageTypes = [...gridConfig.imageTypes];
let images: Image[];
let frames: FrameRequestCallback[];

function fieldRow(label: string) {
  return screen.getByText(label, { selector: "dt" }).parentElement!;
}

beforeEach(async () => {
  resetImageFreshnessForTests();
  vi.clearAllMocks();
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  const base = await new MockDataSource(2).getByIds(["img-0", "img-1"]);
  images = base.map((image, i) => ({
    ...image,
    metadata: { ...image.metadata, keywords: i === 0 ? [...partialKeywords, "shared"] : ["shared"] },
  }));
  useEnrichmentStore.getState().setEnrichment(new Map(images.map(image => [image.id, {
    resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] },
  }])));
});
afterEach(() => {
  cleanup();
  gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, ...configuredImageTypes);
  vi.unstubAllEnvs();
  useEnrichmentStore.getState().setEnrichment(new Map());
  useUsageRightsCatalogue.setState({ categories: null });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("multi-image cost summary", () => {
  it("uses Unknown for missing rights across summaries, detail and badges", () => {
    const unknown = images.map(image => ({ ...image, usageRights: { category: "" } }));
    render(<><MultiImageMetadata images={unknown} reconciledView={recomputeAll(unknown, RECONCILE_FIELDS)} total={2} />
      <ImageMetadata image={unknown[0]} /><CostBadgeFromCost noRights cost="pay" size="md" />
      <CostBadge variant="no-rights" tooltip="Specific warning" /></>);
    expect(screen.getByText("2 Unknown")).toBeTruthy();
    expect(screen.queryByText("None")).toBeNull();
    act(() => useUsageRightsCatalogue.setState({ categories: [{ value: "", name: "Unspecified rights" }] }));
    expect(screen.getByText("2 Unknown")).toBeTruthy();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTitle("Unknown")).toBeTruthy();
    expect(screen.getByTitle("Specific warning")).toBeTruthy();
  });

  it("uses server cost read with selected images, below the current search's overlay", () => {
    const [a, b] = images.map((image) => ({ ...image, usageRights: { category: "staff-photographer" } }));
    attachEnrichment(a, { cost: "overquota" });
    attachEnrichment(b, { cost: "free" });
    useEnrichmentStore.getState().setEnrichment(new Map([[b.id, { cost: "conditional" }]]));
    render(<MultiImageMetadata images={[a, b]} reconciledView={recomputeAll([a, b], RECONCILE_FIELDS)} total={2} />);
    expect(screen.getByText("1 over quota")).toBeTruthy();
    expect(screen.getByText("1 restricted")).toBeTruthy();
    expect(screen.queryByText(/free/)).toBeNull();
  });
});

describe("metadata field preparation", () => {
  it.each(["single", "multiple"])("keeps Source in collapsible additional metadata and Labels separate in %s panels", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { ...image.metadata, source: "Wire source" },
      userMetadata: { ...image.userMetadata, labels: ["fixture-label"], photoshoot: { title: "Fixture photoshoot" } } }));
    render(context === "single" ? <ImageMetadata image={populated[0]} />
      : <MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
    const additional = screen.getByRole("region", { name: "Additional metadata" });
    expect(within(additional).queryByRole("button", { name: "Wire source" })).toBeNull();
    fireEvent.click(within(additional).getByRole("button", { name: "Show additional metadata" }));
    expect(within(additional).getByRole("button", { name: "Wire source" })).toBeTruthy();
    fireEvent.click(within(additional).getByRole("button", { name: "Hide additional metadata" }));
    expect(within(additional).queryByRole("button", { name: "Wire source" })).toBeNull();
    expect(fieldRow("Labels").parentElement?.contains(fieldRow("Photoshoot"))).toBe(false);
  });

  it.each(["single", "multiple"])("keeps important empty fields but hides optional empty fields for %s viewers", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    useEnrichmentStore.getState().setEnrichment(new Map());
    gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, "Photograph");
    const empty = images.map(image => ({ ...image, metadata: {}, usageRights: { category: "" } }));
    render(context === "single" ? <ImageMetadata image={empty[0]} />
      : <MultiImageMetadata images={empty} reconciledView={recomputeAll(empty, RECONCILE_FIELDS)} total={2} />);
    for (const label of ["Image type", "Title", "Description", "Special instructions", "Taken on", "Credit"]) {
      expect(within(fieldRow(label)).getByText("Unknown")).toBeTruthy();
      expect(screen.queryByRole("button", { name: `Edit ${label}` })).toBeNull();
    }
    for (const label of ["By", "Copyright", "Location", "People", "Keywords"]) {
      expect(screen.queryByText(label, { selector: "dt" })).toBeNull();
    }
  });

  it.each(["single", "multiple"])("explains editable empty values and further instructions in %s metadata", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const empty = images.map(image => ({ ...image, metadata: { usageInstructions: "Upstream restrictions" } }));
    render(context === "single" ? <ImageMetadata image={empty[0]} />
      : <MultiImageMetadata images={empty} reconciledView={recomputeAll(empty, RECONCILE_FIELDS)} total={2} />);
    expect(fieldRow("Title").textContent).toContain("Unknown (click ");
    expect(fieldRow("Special instructions").textContent).toContain("add further instructions");
    expect(fieldRow("Special instructions").textContent).not.toContain("Unknown");
    expect(fieldRow("Location").textContent).toContain("Unknown (click ");
    fireEvent.click(within(fieldRow("Title")).getByRole("button", { name: "Add Title" }));
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it.each(["single", "multiple"])("retains populated metadata when %s edit authority is withdrawn", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { credit: "Picture desk", city: "London", peopleInImage: ["A person"] } }));
    render(context === "single" ? <ImageMetadata image={populated[0]} />
      : <MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
    expect(screen.getByRole("button", { name: "Edit Credit" })).toBeTruthy();
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[populated[0].id, { resource: { links: [] } }]])));
    expect(screen.queryByRole("button", { name: "Edit Credit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add person" })).toBeNull();
    for (const value of ["Picture desk", "London", "A person"]) expect(screen.getByText(value)).toBeTruthy();
  });

  it.each([
    { open: "Edit Description", input: "Description", commit: "Commit Description" },
    { open: "Edit Location", input: "City", commit: "Commit Location" },
    { open: "Add keyword", input: "New keyword", commit: "Commit new keyword" },
  ])("retains the $input draft while selected edit authority is withheld", ({ open, input, commit }) => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    render(<MultiImageMetadata images={images} reconciledView={recomputeAll(images, RECONCILE_FIELDS)} total={2} />);
    fireEvent.click(screen.getByRole("button", { name: open }));
    const control = screen.getByLabelText(input) as HTMLInputElement | HTMLTextAreaElement;
    fireEvent.change(control, { target: { value: "Unsent draft" } });
    const permitted = useEnrichmentStore.getState().data.get(images[0].id)!;
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[images[0].id, { resource: { links: [] } }]])));
    expect(screen.getByLabelText(input)).toBe(control);
    expect(control.value).toBe("Unsent draft");
    expect(screen.getByRole("button", { name: commit }).hasAttribute("disabled")).toBe(true);
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[images[0].id, permitted]])));
    expect(screen.getByLabelText(input)).toBe(control);
    expect(screen.getByRole("button", { name: commit }).hasAttribute("disabled")).toBe(false);
  });

  it("explains mixed scalar editing without describing unresolved metadata as empty", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, metadata: { title: index ? "Second title" : "First title" } }));
    const context = { targetIds: selected.map(image => image.id), targets: new Map() };
    const { rerender } = render(<MultiImageMetadata images={selected} total={2} labelEditing={context}
      reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} />);
    expect(fieldRow("Title").textContent).toContain("Multiple titles (click ");
    expect(within(fieldRow("Title")).getByText("all", { selector: "strong" })).toBeTruthy();
    rerender(<MultiImageMetadata images={selected} total={2} labelEditing={{ ...context, pending: true }} reconciledView={null} />);
    expect(fieldRow("Title").textContent).not.toContain("Unknown");
    expect(screen.getByRole("button", { name: "Edit Title" }).hasAttribute("disabled")).toBe(true);
  });

  it("preserves the original offset when editing the repeated local hour", () => {
    vi.stubEnv("TZ", "Europe/London");
    expect(new Date("2026-10-25T01:31").getTimezoneOffset()).toBe(-60);
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_dateTaken")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="2026-10-25T01:30:00Z" onPrepare={prepare}>Taken on</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Minutes" }), { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ value: "2026-10-25T01:31:00.000Z" }));
  });

  it.each(["single", "multiple"])("keeps upstream usage instructions read-only in %s metadata", context => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { ...image.metadata, usageInstructions: "Upstream restrictions", specialInstructions: "" } }));
    render(context === "single" ? <ImageMetadata image={populated[0]} />
      : <MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
    expect(screen.queryByText("Upstream restrictions")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Usage instructions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Special instructions" }));
    expect((screen.getByLabelText("Special instructions") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("Upstream restrictions")).toBeTruthy();
  });

  it("places metadata suggestions outside the heading and action row in either direction", () => {
    vi.spyOn(typeahead, "buildTypeaheadFields").mockReturnValue([{ fieldName: "credit", resolver: ["Reuters"] }]);
    let editorBounds = new DOMRect(100, 80, 260, 160);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-metadata-field")) return editorBounds;
      if (this instanceof HTMLInputElement) return new DOMRect(180, editorBounds.top + 30, 150, 30);
      return new DOMRect();
    });
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="">Empty</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Credit" }));
    const list = screen.getByRole("listbox", { name: "Suggestions for Credit" });
    expect(Number.parseFloat(list.style.top)).toBe(editorBounds.bottom + 6);
    expect(list.style.transform).toBe("");
    editorBounds = new DOMRect(100, window.innerHeight - 140, 260, 120);
    fireEvent(window, new Event("resize"));
    expect(Number.parseFloat(list.style.top)).toBe(editorBounds.top - 6);
    expect(list.style.transform).toBe("translateY(-100%)");
    editorBounds = new DOMRect(100, -100, 260, window.innerHeight + 200);
    fireEvent(window, new Event("resize"));
    const input = screen.getByLabelText("Credit") as HTMLInputElement;
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("dismisses scalar suggestions before cancelling and leaves modified Enter to the editor", () => {
    vi.spyOn(typeahead, "buildTypeaheadFields").mockReturnValue([{ fieldName: "credit", resolver: ["BBC", "Reuters"] }]);
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_credit")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="Original credit" onPrepare={prepare}>Original credit</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Credit" }));
    const input = screen.getByLabelText("Credit") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "R" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByLabelText("Credit")).not.toBeNull();
    expect(input.value).toBe("R");
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(input, { target: { value: "Re" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ fieldId: "metadata_credit", value: "Re" }));
  });

  it("normalizes Photoshoot before deciding whether a commit changes anything", () => {
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "photoshoot")!;
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value="Assignment" onPrepare={prepare}>Assignment</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Photoshoot" }));
    fireEvent.change(screen.getByLabelText("Photoshoot"), { target: { value: " Assignment " } });
    expect(screen.getByRole("button", { name: "Commit Photoshoot" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Photoshoot"), { target: { value: " Another assignment " } });
    fireEvent.click(screen.getByRole("button", { name: "Commit Photoshoot" }));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ fieldId: "photoshoot", value: "Another assignment" }));
  });

  it("distinguishes mixed image types from explicitly clearing their override", () => {
    const types = [...gridConfig.imageTypes];
    gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, "Photograph", "Illustration");
    try {
      const prepare = vi.fn();
      const field = RECONCILE_FIELDS.find(field => field.id === "metadata_imageType")!;
      render(<dl><MetadataTextEditor field={field} targetIds={["first", "second"]} value="" mixed onPrepare={prepare}>Multiple image types</MetadataTextEditor></dl>);
      fireEvent.click(screen.getByRole("button", { name: "Edit Image type" }));
      const input = screen.getByLabelText("Image type") as HTMLSelectElement;
      expect(within(input).queryByRole("option", { name: "Multiple image types" })).not.toBeNull();
      const unknown = within(input).getByRole("option", { name: "Unknown" }) as HTMLOptionElement;
      fireEvent.change(input, { target: { value: unknown.value } });
      expect(screen.getByRole("button", { name: "Commit Image type" }).hasAttribute("disabled")).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Commit Image type" }));
      expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ fieldId: "metadata_imageType", value: "" }));
    } finally { gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, ...types); }
  });

  it("keeps Location input while selected metadata is temporarily pending", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, metadata: { ...image.metadata, city: index ? "Paris" : "London", country: "United Kingdom" } }));
    const view = (pending: boolean) => <MultiImageMetadata images={selected} total={2}
      reconciledView={pending ? null : recomputeAll(selected, RECONCILE_FIELDS)}
      labelEditing={{ targetIds: selected.map(image => image.id), targets: new Map(), pending }} />;
    const { rerender } = render(view(false));
    expect(within(fieldRow("Location")).getByRole("button", { name: "Edit all Location" })).toBeTruthy();
    expect(within(fieldRow("Location")).getByText("all", { selector: "strong" })).toBeTruthy();
    fireEvent.click(within(fieldRow("Location")).getByRole("button", { name: "United Kingdom" }));
    expect(screen.queryByLabelText("City")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Location" }));
    expect(screen.getByLabelText("Sublocation").getAttribute("placeholder")).toBe("or place");
    expect(screen.getByLabelText("State").getAttribute("placeholder")).toBe("or region");
    expect(screen.getByLabelText("City").getAttribute("placeholder")).toBe("Multiple cities");
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Draft city" } });
    rerender(view(true));
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Draft city");
    expect(screen.getByRole("button", { name: "Commit Location" }).hasAttribute("disabled")).toBe(true);
    rerender(view(false));
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe("Draft city");
  });

  it("prepares only changed Location components, preserving untouched shared and mixed values", () => {
    const prepare = vi.fn();
    const fields = LOCATION_COMPONENTS.map(field => ({ ...field, value: field.key === "subLocation" ? "Picture desk" : field.key === "country" ? "United Kingdom" : "", mixed: field.key === "city" || field.key === "state" }));
    render(<dl><MetadataLocationEditor fields={fields} targetIds={["first", "second"]} available onPrepare={prepare}>Multiple cities</MetadataLocationEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Location" }));
    const first = screen.getByLabelText("Sublocation") as HTMLInputElement;
    expect(first.selectionStart).toBe(first.value.length);
    expect(screen.queryByRole("button", { name: "Clear Location" })).toBeNull();
    expect(screen.getByRole("button", { name: "Commit Location" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "London" } });
    fireEvent.keyDown(screen.getByLabelText("City"), { key: "Enter" });
    expect(prepare).toHaveBeenCalledWith({ fieldId: "location", action: "overwrite", value: { city: "London" }, targetIds: ["first", "second"] });
    expect(screen.getByRole("status").textContent).toContain("Not sent");
    fireEvent.click(screen.getByRole("button", { name: "Cancel Location" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Location" }));
    expect(screen.queryByRole("button", { name: "Clear City" })).not.toBeNull();
    const clearCity = screen.getByRole("button", { name: "Clear City" });
    prepare.mockClear();
    expect(fireEvent.keyDown(clearCity, { key: "Enter" })).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    fireEvent.click(clearCity);
    expect(screen.getByLabelText("City").getAttribute("placeholder")).toBeNull();
    expect(screen.getByLabelText("State").getAttribute("placeholder")).toBe("Multiple states");
    fireEvent.click(screen.getByRole("button", { name: "Commit Location" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ fieldId: "location", value: { city: "" } }));
  });

  it("uses configured image types and date segments without changing the stored instant on entry", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const types = [...gridConfig.imageTypes];
    gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, "Photograph", "Illustration");
    try {
      const dateTaken = "2026-11-10T11:22:33.123Z";
      const populated = images.map(image => ({ ...image, metadata: { ...image.metadata, dateTaken, imageType: "Photograph" },
        userMetadata: { ...image.userMetadata, photoshoot: { title: "Assignment" } } }));
      render(<MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
      fireEvent.click(screen.getByRole("button", { name: "Edit Image type" }));
      expect((within(screen.getByLabelText("Image type")).getByRole("option", { name: "Photograph" }) as HTMLOptionElement).selected).toBe(true);
      expect(screen.getByRole("button", { name: "Commit Image type" }).hasAttribute("disabled")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
      const input = screen.getByRole("group", { name: "Taken on" });
      expect((screen.getByRole("textbox", { name: "Milliseconds" }) as HTMLInputElement).value).toBe("123");
      expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
      fireEvent.change(screen.getByRole("textbox", { name: "Day" }), { target: { value: "32" } });
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("alert").textContent).toContain("date and time");
      fireEvent.click(screen.getByRole("button", { name: "Edit Photoshoot" }));
      expect((screen.getByLabelText("Photoshoot") as HTMLInputElement).value).toBe("Assignment");
      expect(screen.getByRole("button", { name: "Add person" })).toBeTruthy();
    } finally { gridConfig.imageTypes.splice(0, gridConfig.imageTypes.length, ...types); }
  });

  it("prepares date changes at whole seconds, retains manual fractions and accepts a complete clear", () => {
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_dateTaken")!;
    const original = "2026-11-10T11:22:33.123Z";
    render(<dl><MetadataTextEditor field={field} targetIds={["first"]} value={original} onPrepare={prepare}>10 Nov 2026 11:22</MetadataTextEditor></dl>);
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    const calendar = screen.getByLabelText("Taken on calendar") as HTMLInputElement;
    expect(calendar.step).toBe("1");
    expect(new Date(calendar.value).getMilliseconds()).toBe(0);
    const expected = new Date(original);
    expected.setDate(expected.getDate() + 1); expected.setMilliseconds(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Day" }), { target: { value: String(expected.getDate()) } });
    expect((screen.getByRole("textbox", { name: "Milliseconds" }) as HTMLInputElement).value).toBe("000");
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ value: expected.toISOString() }));
    fireEvent.change(screen.getByRole("textbox", { name: "Milliseconds" }), { target: { value: "456" } });
    expected.setMilliseconds(456);
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ value: expected.toISOString() }));
    fireEvent.change(screen.getByRole("textbox", { name: "Year" }), { target: { value: "2" } });
    expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ value: "" }));
    fireEvent.change(calendar, { target: { value: "2026-11-12T10:20:30" } });
    expect((screen.getByRole("textbox", { name: "Milliseconds" }) as HTMLInputElement).value).toBe("000");
    fireEvent.change(calendar, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenLastCalledWith(expect.objectContaining({ value: "" }));
    fireEvent.change(calendar, { target: { value: "2026-11-12T10:20:30" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Day" }), { key: "a", ctrlKey: true });
    const minutes = screen.getByRole("textbox", { name: "Minutes" });
    fireEvent.pointerDown(minutes);
    fireEvent.focus(minutes);
    fireEvent.keyDown(minutes, { key: "Backspace" });
    expect((screen.getByRole("textbox", { name: "Year" }) as HTMLInputElement).value).toBe("2026");
    fireEvent.keyDown(minutes, { key: "a", ctrlKey: true });
    fireEvent.keyDown(minutes, { key: "Backspace" });
    expect((screen.getByRole("textbox", { name: "Year" }) as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel Taken on" }));
    expect(screen.getByText("10 Nov 2026 11:22")).toBeTruthy();
  });

  it("keeps mixed date segments through pending reads without treating partial input as clearing", () => {
    const prepare = vi.fn();
    const field = RECONCILE_FIELDS.find(field => field.id === "metadata_dateTaken")!;
    const view = (available: boolean) => <dl><MetadataTextEditor field={field} targetIds={["first", "second"]} value="" mixed available={available} onPrepare={prepare}>Multiple dates</MetadataTextEditor></dl>;
    const { rerender } = render(view(true));
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    expect(screen.getByRole("group", { name: "Taken on" }).textContent).toContain("Multiple dates");
    expect(screen.queryByRole("textbox", { name: "Day" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear Taken on" }));
    expect(screen.getByRole("group", { name: "Taken on" }).textContent).not.toContain("Multiple dates");
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ value: "", targetIds: ["first", "second"] }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Multiple dates" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Day" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Day" }), { target: { value: "1" } });
    expect(screen.getByRole("group", { name: "Taken on" }).textContent).not.toContain("Multiple dates");
    rerender(view(false));
    expect((screen.getByRole("textbox", { name: "Day" }) as HTMLInputElement).value).toBe("1");
    rerender(view(true));
    expect(screen.getByRole("button", { name: "Commit Taken on" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear Taken on" }));
    fireEvent.click(screen.getByRole("button", { name: "Commit Taken on" }));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ value: "", targetIds: ["first", "second"] }));
  });

  it("offers ordinary editable text fields without making Source editable", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const populated = images.map(image => ({ ...image, metadata: { ...image.metadata,
      byline: "Picture desk", specialInstructions: "Handle with care", copyright: "Picture desk", source: "Imported" } }));
    render(<MultiImageMetadata images={populated} reconciledView={recomputeAll(populated, RECONCILE_FIELDS)} total={2} />);
    for (const name of ["By", "Special instructions", "Copyright"]) {
      fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
      const input = screen.getByLabelText(name) as HTMLInputElement | HTMLTextAreaElement;
      expect(input.getAttribute("role")).toBeNull();
      expect(input.selectionStart).toBe(input.value.length);
      expect(input.selectionEnd).toBe(input.value.length);
      fireEvent.click(screen.getByRole("button", { name: `Cancel ${name}` }));
    }
    expect(screen.queryByRole("button", { name: "Edit Source" })).toBeNull();
  });

  it("keeps empty Title disabled but permits blank mixed Description overwrite, not empty additions", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const mixed = images.map((image, index) => ({ ...image, metadata: { ...image.metadata, title: "", description: `Description ${index}`, byline: `Byline ${index}` } }));
    render(<MultiImageMetadata images={mixed} reconciledView={recomputeAll(mixed, RECONCILE_FIELDS)} total={2} />);
    expect(screen.getByRole("button", { name: "Edit Title" }).closest("dt")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Title" }));
    expect(screen.getByRole("button", { name: "Commit Title" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("textbox", { name: "Title" }).getAttribute("placeholder")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit By" }));
    expect(screen.getByRole("textbox", { name: "By" }).getAttribute("placeholder")).toBe("Multiple bylines");
    fireEvent.click(screen.getByRole("button", { name: "Edit Description" }));
    expect((screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("textbox", { name: "Description" }).getAttribute("placeholder")).toBe("Multiple descriptions");
    expect((screen.getByRole("radio", { name: "Overwrite" }) as HTMLInputElement).checked).toBe(true);
    const commit = screen.getByRole("button", { name: "Commit Description" });
    expect(commit.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Clear Description" })).toBeNull();
    for (const name of ["Add before", "Add after"]) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(commit.hasAttribute("disabled")).toBe(true);
      expect(screen.getByRole("textbox", { name: "Description" }).getAttribute("placeholder")).toBeNull();
    }
    fireEvent.click(screen.getByRole("radio", { name: "Overwrite" }));
    fireEvent.click(commit);
    expect(screen.getByRole("status").textContent).toContain("Not sent");
    fireEvent.click(screen.getByRole("button", { name: "Cancel Description" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Description" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "New description" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Description" }), { key: "Enter" });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Description" }), { key: "Enter", metaKey: true });
    expect(screen.getByRole("status").textContent).toContain("Not sent");
  });

  it("prepares collection removal without changing canonical memberships", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const selected = images.map((image, index) => ({ ...image, collections: index ? [] : [{ pathId: "editorial/news", path: ["Editorial", "News"] }] }));
    render(<MultiImageMetadata images={selected} reconciledView={recomputeAll(selected, RECONCILE_FIELDS)} total={2} />);
    const row = fieldRow("Collections");
    expect(within(row).getByRole("button", { name: "Add collection" }).closest("dt")).not.toBeNull();
    expect(row.querySelector("dd")?.contains(within(row).getByRole("button", { name: "Remove editorial/news from all selected images" }))).toBe(true);
    expect(within(row).getByText("Editorial")).toBeTruthy();
    expect(within(row).getByText("News")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Remove editorial/news from all selected images" }));
    expect(screen.getByRole("status").textContent).toContain("Not sent");
    expect(selected[0].collections).toHaveLength(1);
    expect(within(row).getByRole("button", { name: "Apply editorial/news to all selected images" }).title).toContain("all 2 images");
    fireEvent.click(screen.getByRole("button", { name: "Add keyword" }));
    fireEvent.change(screen.getByRole("combobox", { name: "New keyword" }), { target: { value: "shared" } });
    expect(screen.getByRole("button", { name: "Commit new keyword" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel new keyword" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add keyword" }));
  });

  it("keeps Description mode drafts separate and permits clearing shared text without sending", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const shared = images.map(image => ({ ...image, metadata: { ...image.metadata, description: "Shared description" } }));
    const renderView = (pending = false) => <MultiImageMetadata images={shared} reconciledView={recomputeAll(shared, RECONCILE_FIELDS)} total={2}
      labelEditing={{ targetIds: shared.map(image => image.id), targets: new Map(), pending }} />;
    const { rerender } = render(renderView());
    fireEvent.click(screen.getByRole("button", { name: "Edit Description" }));
    const input = screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;
    expect(input.value).toBe("Shared description");
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(screen.queryByRole("radio", { name: "Overwrite" })).toBeNull();
    const commit = screen.getByRole("button", { name: "Commit Description" });
    expect(commit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add before" }));
    expect(input.value).toBe("");
    expect(commit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "Prefix" } });
    rerender(renderView(true));
    expect((screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toBe("Prefix");
    expect(commit.hasAttribute("disabled")).toBe(true);
    rerender(renderView());
    fireEvent.click(screen.getByRole("button", { name: "Add after" }));
    expect(input.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Add before" }));
    expect(input.value).toBe("Prefix");
    fireEvent.click(screen.getByRole("button", { name: "Add before" }));
    expect(input.value).toBe("Shared description");
    fireEvent.change(input, { target: { value: "" } });
    expect(commit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(commit);
    expect(screen.getByRole("status").textContent).toContain("Not sent");
    expect(shared.every(image => image.metadata.description === "Shared description")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel Description" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Edit Description" }));
  });
});

describe("disconnected label editing", () => {
  it("does not cancel label input when Escape dismisses an IME candidate", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const store = createLabelEditorStore();
    const targetIds = ["first"];
    try {
      render(<dl><LabelEditorContext value={store}><LabelEditor context={{ targetIds, targets: new Map([["first", {
        resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/first" }] },
      }]]) }} values={[]} onSearch={vi.fn()} /></LabelEditorContext></dl>);
      fireEvent.click(screen.getByRole("button", { name: "Add label" }));
      const input = screen.getByRole("combobox", { name: "Add label" });
      fireEvent.change(input, { target: { value: "IME draft" } });
      fireEvent.keyDown(input, { key: "Escape", isComposing: true });
      expect(store.getState().drafts.get(labelTargetKey(targetIds))?.value).toBe("IME draft");
    } finally { store.getState().dispose(); }
  });

  it("bounds overlapping bulk submissions and lets a waiting operation be stopped", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    let release!: (result: GridCommandResult) => void;
    const executor = vi.fn().mockImplementationOnce(() => new Promise<GridCommandResult>(resolve => { release = resolve; }))
      .mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const store = createLabelEditorStore(executor, undefined, "connected");
    const context = (imageId: string) => ({ targetIds: [imageId], targets: new Map([[imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }]]) });
    try {
      expect(store.getState().prepare("add", "first", context("first"))).toBe(true);
      recordImageAvailability(["unavailable"], "unavailable");
      expect(store.getState().prepare("add", "unavailable", context("unavailable"))).toBe(false);
      expect(store.getState().prepare("add", "invalid", context("invalid/id"))).toBe(false);
      expect(store.getState().prepare("add", "second", context("second"))).toBe(true);
      expect(store.getState().prepare("add", "third", context("third"))).toBe(false);
      expect(store.getState().refusal).toBe("busy");
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().receipts[1].items[0].state).toBe("queued");
      render(<LabelEditorContext value={store}><LabelOperationReceipts /></LabelEditorContext>);
      expect(screen.getAllByRole("progressbar", { name: "Label operation progress" })).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "Stop remaining" }));
      expect(store.getState().receipts[1].items[0].state).toBe("stopped");
      await act(async () => { release({ outcome: "unknown" }); });
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().receipts[0].items[0].state).toBe("unknown");
      expect(store.getState().prepare("add", "second", context("second"))).toBe(true);
      expect(store.getState().receipts).toHaveLength(3);
    } finally { store.getState().dispose(); release?.({ outcome: "unknown" }); }
  });

  it("refuses oversized actual membership before consulting target metadata", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const executor = vi.fn();
    const store = createLabelEditorStore(executor, undefined, "connected");
    const targets = new Map();
    const getTarget = vi.spyOn(targets, "get");
    expect(store.getState().prepare("add", "news", {
      targetIds: Array.from({ length: 5_001 }, (_, index) => `image-${index}`), targets,
    })).toBe(false);
    expect(store.getState().refusal).toBe("target-limit");
    expect(getTarget).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    render(<LabelEditorContext value={store}><MultiImageMetadata images={images} total={101}
      reconciledView={recomputeAll(images, RECONCILE_FIELDS)} labelEditing={{
        targetIds: Array.from({ length: 101 }, (_, index) => `image-${index}`), targets,
      }} /></LabelEditorContext>);
    expect(screen.getByText("Select at most 100 images to edit labels.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add label" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Edit Title" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add keyword" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add collection" }).hasAttribute("disabled")).toBe(true);
    store.getState().dispose();
  });

  it("shows every bounded connected target outcome, including failures beyond the old preview", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const executor = vi.fn(async (command: LabelCommand): Promise<GridCommandResult> => command.imageId === "image-8"
      ? { outcome: "rejected", status: 403, errorKey: "ninth-rejection" } : { outcome: "acknowledged" });
    const store = createLabelEditorStore(executor, undefined, "connected");
    const ids = Array.from({ length: 9 }, (_, index) => `image-${index}`);
    try {
      store.getState().prepare("add", "news", { targetIds: ids, targets: new Map(ids.map(imageId => [imageId, {
        resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
      }])) });
      await vi.advanceTimersByTimeAsync(2_000);
      render(<LabelEditorContext value={store}><LabelOperationReceipts /></LabelEditorContext>);
      fireEvent.click(screen.getByText("Details", { selector: "summary" }));
      expect(screen.getByText(/ninth-rejection/).textContent).toContain('"imageId": "image-8"');
    } finally { store.getState().dispose(); vi.useRealTimers(); }
  });

  it("holds the next operation until grouped observation finishes, preserving pacing across handoff", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    let release!: (images: Image[]) => void;
    const executor = vi.fn().mockResolvedValueOnce({ outcome: "acknowledged" })
      .mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const readImages = vi.fn(() => new Promise<Image[]>(resolve => { release = resolve; }));
    const publishImages = vi.fn();
    const store = createLabelEditorStore(executor, { readImages, publishImages }, "connected");
    const context = (imageId: string) => ({ targetIds: [imageId], targets: new Map([[imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }]]) });
    try {
      store.getState().prepare("add", "news", context(images[0].id));
      store.getState().prepare("add", "news", context(images[1].id));
      await vi.advanceTimersByTimeAsync(100);
      expect(executor).toHaveBeenCalledTimes(1);
      release([{ ...images[0], userMetadata: { labels: ["news"] } }]);
      await vi.advanceTimersByTimeAsync(149);
      expect(publishImages).toHaveBeenCalledTimes(1);
      expect(executor).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(executor).toHaveBeenCalledTimes(2);
      expect(store.getState().receipts.map(receipt => receipt.items[0].state)).toEqual(["accepted-awaiting-visibility", "rejected"]);
    } finally { store.getState().dispose(); release?.([]); vi.useRealTimers(); }
  });

  it("refuses a waiting target whose capability was withdrawn by a newer browsing read", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    let release!: (images: Image[]) => void;
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(executor, {
      readImages: () => new Promise<Image[]>(resolve => { release = resolve; }), publishImages: vi.fn(),
    }, "connected");
    const context = (imageId: string) => ({ targetIds: [imageId], targets: new Map([[imageId, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }]]) });
    try {
      store.getState().prepare("add", "news", context(images[0].id));
      store.getState().prepare("add", "news", context(images[1].id));
      await vi.advanceTimersByTimeAsync(100);
      const denied = { resource: { links: [] } };
      stampImageRead(images[1], denied, captureImageRead(), "lean");
      acceptImageOverlay(images[1].id, denied);
      release([{ ...images[0], userMetadata: { labels: ["news"] } }]);
      await vi.advanceTimersByTimeAsync(150);
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().receipts[1].blocked).toBe("capabilities");
    } finally { store.getState().dispose(); release?.([]); vi.useRealTimers(); }
  });

  it("allows a new explicit connected add after observed add and removal without replaying pending or unknown commands", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] };
    const context = { targetIds: [images[0].id], targets: new Map([[images[0].id, { resource }]]) };
    let labels: string[] = [];
    let version = 0;
    const executor = vi.fn(async (command: import("@/lib/grid-commands").LabelCommand): Promise<GridCommandResult> => {
      labels = command.operation === "add-labels" ? command.labels : [];
      version++;
      return { outcome: version === 3 ? "unknown" : "acknowledged" };
    });
    const store = createLabelEditorStore(executor, {
      readImages: async () => {
        const image = { ...images[0], userMetadata: { labels, lastModified: new Date(Date.UTC(2026, 10, 7) + version * 1000).toISOString() } };
        attachEnrichment(image, { resource });
        return [image];
      },
      publishImages: vi.fn(),
    }, "connected");
    try {
      await act(async () => {
        store.getState().prepare("add", "again", context);
        store.getState().prepare("add", "again", context);
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().receipts[0].items[0].observation).toBe("observed");
      await act(async () => { store.getState().prepare("remove", "again", context); await vi.advanceTimersByTimeAsync(250); });
      expect(store.getState().receipts[1].items[0].observation).toBe("observed");
      await act(async () => { store.getState().prepare("add", "again", context); await vi.advanceTimersByTimeAsync(250); });
      expect(executor).toHaveBeenCalledTimes(3);
      expect(store.getState().receipts[2].items[0]).toMatchObject({ state: "unknown", observation: "observed" });
      await act(async () => { store.getState().prepare("add", "again", context); });
      expect(executor).toHaveBeenCalledTimes(3);
    } finally { store.getState().dispose(); vi.useRealTimers(); }
  });

  it("admits a new explicit action after an acknowledged deadline and a fresh canonical read", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.useFakeTimers();
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] };
    const context = { targetIds: [images[0].id], targets: new Map([[images[0].id, { resource }]]) };
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(executor, { readImages: async () => [], publishImages: vi.fn() }, "connected");
    try {
      expect(store.getState().prepare("add", "again", context)).toBe(true);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(store.getState().receipts[0].items[0]).toMatchObject({ state: "accepted-awaiting-visibility", observation: "deadline" });
      expect(store.getState().prepare("add", "again", context)).toBe(false);
      const currentResource = structuredClone(resource);
      const current = { ...images[0], userMetadata: { labels: ["again"], lastModified: "2026-11-08T00:00:00Z" } };
      attachEnrichment(current, { resource: currentResource });
      stampImageRead(current, { resource: currentResource }, captureImageRead(), "lean");
      expect(acceptEnrichedImage(current)).toBe(current);
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.getState().prepare("add", "again", {
        targetIds: [current.id], targets: new Map([[current.id, { resource: currentResource }]]),
      })).toBe(true);
      await vi.advanceTimersByTimeAsync(250);
      expect(executor).toHaveBeenCalledTimes(2);
      expect(store.getState().receipts).toHaveLength(2);
    } finally { store.getState().dispose(); vi.useRealTimers(); }
  });

  it("labels connected receipts truthfully and refuses oversized execution", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const executor = vi.fn().mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const store = createLabelEditorStore(executor, undefined, "connected");
    const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] };
    render(<LabelEditorContext value={store}><ImageMetadata image={images[0]} overlay={{ resource }} /><LabelOperationReceipts /></LabelEditorContext>);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "connected label" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    expect(executor).toHaveBeenCalledTimes(1);
    expect(store.getState().receipts[0]).toMatchObject({ mode: "connected", items: [{ state: "rejected" }] });
    expect(screen.getByText("Label change", { exact: true })).toBeTruthy();
    expect(screen.queryByText(/Simulated/)).toBeNull();
    act(() => { store.getState().prepare("add", "another label", {
      targetIds: Array.from({ length: 101 }, (_, index) => `image-${index}`), targets: new Map(),
    }); });
    expect(store.getState().refusal).toBe("target-limit");
    expect(store.getState().receipts).toHaveLength(1);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("rechecks captured standalone authority at submit without requiring a parent rerender", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const operation = admitLabelObservation([images[0].id]);
    if (typeof operation !== "number") throw new Error(operation);
    const image = { ...images[0], userMetadata: { labels: ["news"], lastModified: "2026-11-02T00:00:00Z" } };
    const positive = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] } };
    stampImageRead(image, positive, captureImageRead(), "full");
    acceptObservedImages([image], operation);
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(executor);
    render(<LabelEditorContext value={store}><ImageMetadata image={image} overlay={positive} /></LabelEditorContext>);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "another label" } });
    const stale = { ...image, userMetadata: { labels: [], lastModified: "2026-11-01T00:00:00Z" } };
    const denied = { resource: { links: [] }, actions: [] };
    stampImageRead(stale, denied, captureImageRead(), "lean");
    attachEnrichment(stale, denied);
    expect(acceptEnrichedImage(stale)).toBeUndefined();
    fireEvent.submit(input.closest("form")!);
    expect(executor).not.toHaveBeenCalled();
    expect(store.getState().receipts).toEqual([]);
  });

  it("does not admit editing a stale displayed body using a newer explicit context", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const operation = admitLabelObservation([images[0].id]);
    if (typeof operation !== "number") throw new Error(operation);
    const old = { ...images[0], userMetadata: { labels: ["old"], lastModified: "2026-11-01T00:00:00Z" } };
    const current = { ...old, userMetadata: { labels: ["current"], lastModified: "2026-11-02T00:00:00Z" } };
    const positive = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] } };
    stampImageRead(current, positive, captureImageRead(), "lean");
    acceptObservedImages([current], operation);
    render(<ImageMetadata image={old} labelEditing={{ targetIds: [old.id], targets: new Map([[old.id, { resource: positive.resource }]]) }} />);
    expect(screen.getByRole("button", { name: "Add label" }).hasAttribute("disabled")).toBe(true);
  });

  it.each([false, true])("preflights the entire comma-separated input before dispatch (simulated=%s)", (simulated) => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const store = createLabelEditorStore(simulated ? executor : undefined);
    const overlay = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-0" }] } };
    render(<LabelEditorContext value={store}><ImageMetadata image={images[0]} overlay={overlay} /><LabelOperationReceipts /></LabelEditorContext>);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    const input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "first label, second label" } });
    fireEvent.submit(input.closest("form")!);
    expect(executor).not.toHaveBeenCalled();
    if (simulated) {
      expect(store.getState().receipts).toHaveLength(0);
      expect(store.getState().refusal).toBe("multiple-labels");
      expect((screen.getByRole("combobox", { name: "Add label" }) as HTMLInputElement).value).toBe("first label, second label");
    } else {
      expect(store.getState().receipts.map(receipt => receipt.intent.label)).toEqual(["first label", "second label"]);
      expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    }
  });

  it("cancels unsent input on Escape and retains navigation drafts, using the owned overlay without service calls", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const transport = vi.spyOn(globalThis, "fetch");
    const store = createLabelEditorStore();
    const overlay = { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${images[0].id}` }] } };
    useEnrichmentStore.getState().setEnrichment(new Map([[images[0].id, { resource: { links: [] } }]]));
    const editor = () => <LabelEditorContext value={store}><ImageMetadata image={images[0]} overlay={overlay} /><LabelOperationReceipts /></LabelEditorContext>;
    const first = render(editor());
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    let input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.submit(input.closest("form")!);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(input, { target: { value: "new label" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    expect(store.getState().drafts.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "new label" } });
    first.unmount();
    render(editor());
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    expect((input as HTMLInputElement).value).toBe("new label");
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByText("Not sent - dry run")).toBeTruthy();
    expect(store.getState().receipts[0].intent.targetIds).toEqual([images[0].id]);
    expect(store.getState().receipts[0].items[0].state).toBe("not-started");
    expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "second-label" } });
    fireEvent.submit(input.closest("form")!);
    const activity = screen.getByRole("complementary", { name: "Label activity" }).textContent!;
    expect(activity.indexOf("second-label")).toBeLessThan(activity.indexOf("new label"));
    fireEvent.click(screen.getByRole("button", { name: "Add label" }));
    input = screen.getByRole("combobox", { name: "Add label" });
    fireEvent.change(input, { target: { value: "new label" } });
    fireEvent.submit(input.closest("form")!);
    expect(store.getState().receipts).toHaveLength(2);
    expect(screen.queryByRole("combobox", { name: "Add label" })).toBeNull();
    expect(screen.getByText("Operation already recorded.")).toBeTruthy();
    expect(transport).not.toHaveBeenCalled();
  });

  it("uses the same editor for held fake outcomes and rejects a changed target at the action boundary", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    let release!: (result: GridCommandResult) => void;
    const executor = vi.fn()
      .mockImplementationOnce(() => new Promise<GridCommandResult>(resolve => { release = resolve; }))
      .mockResolvedValueOnce({ outcome: "unknown" });
    const store = createLabelEditorStore(executor);
    const editing = { targetIds: images.map(image => image.id), targets: new Map(images.map(image => [image.id, {
      resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] },
    }])) };
    let current = editing;
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("labels", { kind: "chip-array", total: 2, chips: [{ value: "partial", count: 1 }] });
    render(<LabelEditorContext value={store}><MultiImageMetadata images={images} total={2} reconciledView={view}
      labelEditing={editing} resolveLabelEditing={() => current} /><LabelOperationReceipts /></LabelEditorContext>);
    const add = screen.getByRole("button", { name: "Apply partial to all selected images" });
    current = { targetIds: ["changed"], targets: new Map([["changed", {
      resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/changed" }] },
    }]]) };
    fireEvent.click(add);
    expect(executor).not.toHaveBeenCalled();
    expect(store.getState().receipts).toHaveLength(0);
    current = editing;
    await act(async () => { fireEvent.click(add); fireEvent.click(add); });
    expect(executor).toHaveBeenCalledTimes(2);
    expect(store.getState().receipts[0].items.map(item => item.state)).toEqual(["submitted", "unknown"]);
    current = { ...editing, targetIds: ["changed"] };
    await act(async () => { release({ outcome: "acknowledged" }); });
    expect(store.getState().receipts[0].intent.targetIds).toEqual(editing.targetIds);
    expect(store.getState().receipts[0].items.map(item => item.state)).toEqual(["accepted-awaiting-visibility", "unknown"]);
    expect(screen.getByText("Simulated - no service calls")).toBeTruthy();
  });

  it("offers separate search, apply-to-all and remove controls, blocking unresolved selected IDs", () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const view = recomputeAll(images, RECONCILE_FIELDS);
    view.set("labels", { kind: "chip-array", total: 2, chips: [{ value: "news", count: 1 }] });
    const editing = {
      targetIds: [...images.map(image => image.id), "unloaded"],
      targets: new Map(images.map(image => [image.id, { resource: { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${image.id}` }] } }])),
    };
    const { rerender } = render(<MultiImageMetadata images={images} reconciledView={view} total={2} labelEditing={editing} />);
    const row = within(fieldRow("Labels"));
    expect(row.getByRole("button", { name: "Apply news to all selected images" }).hasAttribute("disabled")).toBe(true);
    expect(row.queryByText(/selected:.*eligible/)).toBeNull();
    fireEvent.click(row.getByRole("button", { name: "news" }), { shiftKey: true });
    expect(fixture.updateSearch).toHaveBeenLastCalledWith({ query: "credit:Reuters label:news", image: undefined });
    view.set("labels", { kind: "chip-array", total: 5, chips: [{ value: "news", count: 5 }] });
    rerender(<MultiImageMetadata images={images} reconciledView={view} total={5}
      labelEditing={{ ...editing, targetIds: [images[0].id], pending: true }} />);
    expect(row.getByRole("button", { name: "Remove news" }).hasAttribute("disabled")).toBe(true);
    expect(row.getByRole("button", { name: "news" }).getAttribute("title")).not.toContain("5/1");
    expect(row.getByRole("button", { name: "Add label" }).hasAttribute("disabled")).toBe(true);
    expect(row.queryByRole("combobox", { name: "Add label" })).toBeNull();
  });
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
    expect(pills[0].className).toContain("bg-[#222]");
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
