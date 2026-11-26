// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("matchMedia", vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})));

const { ValueLink, FieldValue } = await import("./metadata-primitives");
const { FIELD_REGISTRY } = await import("@/lib/field-registry");
const { MockDataSource } = await import("@/dal/mock-data-source");

afterEach(cleanup);

const { LeaseEditor } = await import("./LeaseEditor");
const { FormBatchContext, MetadataBatchArrow, MetadataEditorContext, SelectionSaveIndicator } = await import("./MetadataEditing");
const { MetadataPillEditor } = await import("./MetadataPillEditor");
const { createMetadataEditorStore } = await import("@/stores/metadata-editor-store");
const { attachEnrichment } = await import("@/stores/enrichment-store");
const { leaseSetKey } = await import("@/lib/lease-change");

function countedMembers<T>(members: T[]) {
  let reads = 0;
  const values = new Proxy(members, { get(target, key, receiver) {
    if (typeof key === "string" && /^\d+$/.test(key)) reads++;
    return Reflect.get(target, key, receiver);
  } });
  return { values, reads: () => reads };
}

it("renders Form peer counts without rescanning the admitted batch per field", () => {
  const store = createMetadataEditorStore();
  store.setState({ connected: true });
  const members = countedMembers(Array.from({ length: 200 }, (_, index) => `image-${index}`));
  render(<MetadataEditorContext value={store}><FormBatchContext value={{ key: "batch", ids: members.values }}>
    <MetadataBatchArrow imageId="image-199" fieldId="metadata_credit" label="Credit" value="Desk" disabled={false} />
    <MetadataBatchArrow imageId="image-199" fieldId="metadata_byline" label="Byline" value="Desk" disabled={false} />
  </FormBatchContext></MetadataEditorContext>);
  expect(screen.getAllByRole("button", { name: /to 199 other images/ })).toHaveLength(2);
  expect(members.reads()).toBe(0);
});

it("keeps Detail issues scoped without recounting active progress on notifications", () => {
  const store = createMetadataEditorStore();
  const ids = Array.from({ length: 200 }, (_, index) => `image-${index}`);
  const members = countedMembers(ids);
  const items = countedMembers(ids.map(imageId => ({ imageId, state: "submitted" as const })));
  const intent = { fieldId: "metadata_credit", action: "overwrite", value: "Desk", targetIds: members.values } as const;
  store.setState({ panelSaves: [{ id: 2, targetKey: "active" }, { id: 1, targetKey: "older" }], saves: new Map([
    [1, { id: 1, intent: { ...intent, targetIds: ["image-199", "outside"] }, state: "finished", items: [], excluded: 0, message: "Not sent" }],
    [2, { id: 2, intent, state: "saving", items: items.values, excluded: 0 }],
  ]) });
  const indicator = (id: string) => <MetadataEditorContext value={store}><SelectionSaveIndicator targetKey="detail" detailImageId={id} /></MetadataEditorContext>;
  const view = render(indicator("image-199"));
  expect(view.container.textContent).toBe("");
  const before = [members.reads(), items.reads()];
  expect(items.reads()).toBe(0);
  for (let index = 0; index < 10; index++) act(() => store.setState({ connected: index % 2 === 0 }));
  const extra = [members.reads() - before[0], items.reads() - before[1]];
  view.rerender(indicator("outside"));
  expect(screen.getByRole("button").textContent).toMatch(/1 issue/i);
  expect(extra).toEqual([0, 0]);
});

it("removes the exact existing Form label rather than its trimmed neighbour", () => {
  const store = createMetadataEditorStore();
  const submit = vi.fn();
  store.setState({ connected: true, submit });
  const view = render(<MetadataEditorContext.Provider value={store}><MetadataPillEditor form field={FIELD_REGISTRY.find(field => field.id === "labels")!}
    targetIds={["first"]} values={[{ value: "news", count: 1 }, { value: " news ", count: 1 }]} onSearch={() => {}} /></MetadataEditorContext.Provider>);
  fireEvent.click(view.container.querySelector('button[aria-label="Remove  news "]')!);
  expect(submit.mock.calls[0]?.[0]).toMatchObject({ action: "remove", value: " news " });
  store.getState().dispose();
});

describe("Lease editor", () => {
  it("focuses Access, retains an applicable start, and returns focus on cancel", async () => {
    const [image] = await new MockDataSource(1).getByIds(["img-0"]);
    const store = createMetadataEditorStore();
    store.setState({ connected: true });
    render(<MetadataEditorContext.Provider value={store}><LeaseEditor ids={[image.id]} images={[{ ...image, leases: { leases: [] } }]} allowed /></MetadataEditorContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Add lease" }));
    const access = await screen.findByLabelText("Access");
    expect(document.activeElement).toBe(access);
    fireEvent.change(access, { target: { value: "allow-use" } });
    expect(screen.queryByLabelText("Starts", { exact: true })).toBeNull();
    expect((screen.getByLabelText("Expires", { exact: true }) as HTMLInputElement).value).toMatch(/T23:59$/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Set expiry" }));
    expect(screen.queryByLabelText("Expires", { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Delay start" }));
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-02-03T12:00" } });
    fireEvent.change(access, { target: { value: "deny-use" } });
    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe("2026-02-03T12:00");
    fireEvent.keyDown(access, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add lease" }));
    store.getState().dispose();
  });

  it("retains a rejected Upload draft across remount until discarded without replay", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const [sample] = await new MockDataSource(1).getByIds(["img-0"]);
    const image = { ...sample, id: "lease-rejection", leases: { leases: [] } };
    attachEnrichment(image, { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/edits" }] } });
    const execute = vi.fn().mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "forbidden" });
    const store = createMetadataEditorStore(execute, { readImages: async () => [image], publishImages: vi.fn() });
    const view = <MetadataEditorContext.Provider value={store}><LeaseEditor ids={[image.id]} images={[image]} allowed form /></MetadataEditorContext.Provider>;
    try {
      const { rerender } = render(view);
      fireEvent.click(screen.getByRole("button", { name: "Add lease" }));
      fireEvent.change(screen.getByLabelText("Access"), { target: { value: "deny-use" } });
      fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Check permission" } });
      fireEvent.click(screen.getByRole("button", { name: "Save lease" }));
      rerender(<></>);
      await waitFor(() => expect([...store.getState().saves.values()][0]?.state).toBe("finished"));
      rerender(view);
      expect(screen.getByRole("status").textContent).toBe("Not saved");
      expect((screen.getByLabelText("Notes") as HTMLInputElement).value).toBe("Check permission");
      fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
      expect(screen.queryByLabelText("Access")).toBeNull();
      expect(execute).toHaveBeenCalledTimes(1);
    } finally { store.getState().dispose(); vi.unstubAllEnvs(); }
  });

  it("locks a partially confirmed addition against replay until explicit discard", async () => {
    const samples = await new MockDataSource(2).getByIds(["img-0", "img-1"]);
    const images = samples.map(image => ({ ...image, leases: { leases: [] } }));
    const ids = images.map(image => image.id);
    const store = createMetadataEditorStore();
    const submit = vi.fn<ReturnType<typeof store.getState>["submit"]>(intent => {
      store.setState({ saves: new Map([[1, { id: 1, intent, state: "queued", items: [], excluded: 0 }]]) });
      return 1;
    });
    store.setState({ connected: true, submit });
    render(<MetadataEditorContext.Provider value={store}><LeaseEditor ids={ids} images={images} allowed /></MetadataEditorContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Add lease" }));
    fireEvent.change(screen.getByLabelText("Access"), { target: { value: "allow-use" } });
    fireEvent.click(screen.getByRole("button", { name: "Save lease" }));
    const save = store.getState().saves.get(1)!;
    act(() => store.setState({ saves: new Map([[1, { ...save, state: "finished", items: [
      { imageId: ids[0], state: "accepted-awaiting-visibility", observation: "observed" }, { imageId: ids[1], state: "unknown" },
    ] }]]) }));
    expect(screen.getByRole("status").textContent).toBe("Not confirmed");
    expect((screen.getByRole("button", { name: "Save lease" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("form", { name: "New lease" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(submit).toHaveBeenCalledTimes(1);
    store.getState().dispose();
  });

  it.each([false, true])("clears a confirmed Upload draft and respects focus moved elsewhere: %s", async moved => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    const [sample] = await new MockDataSource(1).getByIds(["img-0"]);
    const image = { ...sample, id: `lease-focus-${moved}`, leases: { leases: [] } };
    const lease = { id: "new", access: "allow-syndication" } as const;
    attachEnrichment(image, { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/edits" }] } });
    const execute = vi.fn().mockResolvedValue({ outcome: "acknowledged", expectedLeases: leaseSetKey([lease]) });
    const store = createMetadataEditorStore(execute, { readImages: async () => [execute.mock.calls.length ? { ...image, leases: { leases: [lease] } } : image], publishImages: vi.fn() });
    try {
      render(<MetadataEditorContext.Provider value={store}><LeaseEditor ids={[image.id]} images={[image]} allowed form /><button>Elsewhere</button></MetadataEditorContext.Provider>);
      fireEvent.click(screen.getByRole("button", { name: "Add lease" }));
      fireEvent.change(screen.getByLabelText("Access"), { target: { value: lease.access } });
      fireEvent.click(screen.getByRole("button", { name: "Save lease" }));
      const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
      if (moved) elsewhere.focus();
      const add = await screen.findByRole("button", { name: "Add lease" }, { timeout: 3000 });
      expect(document.activeElement).toBe(moved ? elsewhere : add);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally { store.getState().dispose(); vi.unstubAllEnvs(); }
  });
});

describe("Location punctuation", () => {
  it("groups trailing commas with values, outside links, with breakable spaces between groups", async () => {
    const [image] = await new MockDataSource(1).getByIds(["img-0"]);
    const { container } = render(<FieldValue
      field={FIELD_REGISTRY.find(field => field.id === "location")!}
      image={{ ...image, metadata: { ...image.metadata, subLocation: "Venue", city: "City", state: undefined, country: "Country" } }}
      onSearch={vi.fn()}
    />);
    expect(container.textContent).toBe("Venue, City, Country");
    const groups = container.querySelectorAll(".inline-flex");
    expect(Array.from(groups, group => group.textContent)).toEqual(["Venue,", "City,", "Country"]);
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Venue", "City", "Country"]);
    expect(groups[0].nextSibling?.textContent).toBe(" ");
  });
});

describe("ValueLink", () => {
  it("exposes its exact search field and value", () => {
    render(
      <ValueLink
        cqlKey="colourModel"
        value="RGB"
        onSearch={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "RGB" });
    expect(button.getAttribute("data-cql-key")).toBe("colourModel");
    expect(button.getAttribute("data-cql-value")).toBe("RGB");
  });
});