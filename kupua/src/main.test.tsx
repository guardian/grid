/** @vitest-environment jsdom */

import { afterAll, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react/pure";
import { createCqlInput, createParser } from "@guardian/cql";

vi.hoisted(() => {
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal("requestIdleCallback", vi.fn(() => 0));
  Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => false) });
});

const startup = vi.hoisted(() => ({ render: vi.fn(), esConstructed: 0 }));

vi.mock("./dal/es-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dal/es-adapter")>();
  class CountedElasticsearchDataSource extends actual.ElasticsearchDataSource {
    constructor() {
      super();
      startup.esConstructed++;
    }
  }
  return { ...actual, ElasticsearchDataSource: CountedElasticsearchDataSource };
});

vi.mock("@guardian/cql", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@guardian/cql")>();
  return { ...actual, createCqlInput: vi.fn(actual.createCqlInput) };
});

vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) =>
      (args[0] as HTMLElement).id === "root"
        ? { render: startup.render, unmount: vi.fn() }
        : actual.createRoot(...args),
  };
});

afterAll(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  document.getElementById("root")?.remove();
  Reflect.deleteProperty(document, "execCommand");
});

it("U6z initializes API ownership before imports, including main's collection load and default selection hydration", async () => {
  const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input, "http://localhost").pathname;
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ path, body });
    if (path === "/collections") return Response.json({ data: { basename: "root", children: [] } });
    if (path === "/api/images/aggregations") return Response.json({
      fields: { "collections.pathId": { buckets: [{ key: "fixture/child", count: 3 }] } }, isFilterCounts: {},
    });
    if (path === "/api/images/mget") return Response.json({
      data: [{ data: { id: "fixture-selected", uploadTime: "2026-01-01T00:00:00Z", metadata: {} } }],
    });
    return new Response(null, { status: 503 });
  }));
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);

  await import("./main");
  const { useSearchStore } = await import("./stores/search-store");
  const { useSelectionStore } = await import("./stores/selection-store");
  const { useCollectionStore } = await import("./stores/collection-store");
  const { ApiDataSource } = await import("./dal/api-data-source");
  const source = useSearchStore.getState().dataSource;

  expect(source).toBeInstanceOf(ApiDataSource);
  expect(source.searchByAi).toBe(ApiDataSource.prototype.searchByAi);
  expect(startup.esConstructed).toBe(0);
  await vi.waitFor(() => expect(calls.filter(({ path }) => path === "/api")).toHaveLength(1));
  expect(calls.filter(({ path }) => path.startsWith("/bedrock"))).toEqual([]);
  expect((await import("./lib/grid-config")).aiSearchAvailable).toBe(false);
  expect(useSelectionStore.getState().dataSource).toBe(source);
  expect(startup.render).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(useCollectionStore.getState().status).toBe("ready"));
  expect(useCollectionStore.getState().tree?.data.basename).toBe("root");
  expect(useCollectionStore.getState().counts).toEqual({ fixture: 3, "fixture/child": 3 });
  expect(calls.find(({ path }) => path === "/api/images/aggregations")?.body).toMatchObject({
    free: true, fields: [{ field: "collections.pathId", size: 6000 }],
  });

  useSelectionStore.setState({ selectedIds: new Set(["fixture-selected"]), anchorId: "fixture-selected" });
  await useSelectionStore.getState().hydrate();
  expect([...useSelectionStore.getState().selectedIds]).toEqual(["fixture-selected"]);
  expect(useSelectionStore.getState().metadataCache.get("fixture-selected")?.id).toBe("fixture-selected");
  expect(calls.filter(({ path }) => path === "/api/images/mget")).toEqual([
    { path: "/api/images/mget", body: { ids: ["fixture-selected"] } },
  ]);
  expect(calls.filter(({ path }) => path.startsWith("/es/"))).toEqual([]);
});

it("U6z keeps the first API resolver through remounts with cold registered, alias and dotted suggestions and fresh counts", async () => {
  const { CqlSearchInput } = await import("./components/CqlSearchInput");
  const { useSearchStore } = await import("./stores/search-store");
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  let count = 23;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    requests.push({ path, body });
    expect(path).toBe("/api/images/aggregations");
    return Response.json({
      fields: Object.fromEntries((body.fields as Array<{ field: string }>).map(({ field }) => [field, {
        buckets: [{ key: field === "fileMetadata.iptc.Edit Status" ? "ORIGINAL" : "Fixture value", count }],
      }])),
      isFilterCounts: {},
    });
  }));
  const view = render(<CqlSearchInput value="" onChange={() => {}} />);
  const constructor = customElements.get("cql-input");
  const resolver = vi.mocked(createCqlInput).mock.calls[0][0];
  const parse = createParser({ shortcuts: { "#": "label", "~": "collection" } });
  const suggestions = async (query: string) => {
    const ast = parse(query).queryAst!;
    const result = await resolver.getSuggestions(ast);
    return result.filter((entry) => entry.position === "chipValue").flatMap((entry) => entry.suggestions);
  };

  try {
    for (const generation of [0, 1, 2]) {
      count = 23 + generation;
      act(() => useSearchStore.setState({
        aggregations: null, tickerCounts: { "agency picks": { value: 101 + generation } },
        isFilterCounts: { deleted: 2, "under-quota": 3 }, params: { nonFree: "true" },
      }));
      for (const [query, field, value] of [
        ["city:Fixture credit:", "metadata.credit", "Fixture value"],
        ["city:Fixture editStatus:", "fileMetadata.iptc.Edit Status", "ORIGINAL"],
        ['city:Fixture "fileMetadata.fixture":', "fileMetadata.fixture", "Fixture value"],
      ]) {
        expect(await suggestions(query)).toContainEqual(expect.objectContaining({ value, count }));
        expect(requests.at(-1)?.body).toMatchObject({
          q: "city:Fixture -is:deleted -usages@status:replaced", fields: [{ field }],
        });
      }
      expect(await suggestions("is:")).toContainEqual(expect.objectContaining({ value: "agency-pick", count: 101 + generation }));
      const element = view.container.querySelector("cql-input");
      view.rerender(<CqlSearchInput key={generation + 1} value="" onChange={() => {}} />);
      expect(view.container.querySelector("cql-input")).not.toBe(element);
      expect(customElements.get("cql-input")).toBe(constructor);
      expect(createCqlInput).toHaveBeenCalledOnce();
    }
    expect(requests.length).toBeGreaterThanOrEqual(9);
  } finally {
    view.unmount();
  }
});

it.each(["refused", "unavailable", "incomplete", "empty"])("U6z keeps the collection tree with %s counts through its startup owner", async (outcome) => {
  const { useSearchStore } = await import("./stores/search-store");
  const { useCollectionStore } = await import("./stores/collection-store");
  const paths: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const path = new URL(input, "http://localhost").pathname;
    paths.push(path);
    if (path === "/collections") return Response.json({ data: { basename: "fixture-tree", children: [] } });
    expect(path).toBe("/api/images/aggregations");
    if (outcome === "unavailable") throw new TypeError("synthetic transport unavailable");
    if (outcome === "empty") return Response.json({ fields: {}, isFilterCounts: {} });
    return Response.json({ errorKey: outcome === "incomplete" ? "aggregations-incomplete" : "forbidden" },
      { status: outcome === "incomplete" ? 503 : 403 });
  }));
  useCollectionStore.setState({ status: "idle", counts: { stale: 9 } });
  await useCollectionStore.getState().loadCollections(useSearchStore.getState().dataSource);
  expect(useCollectionStore.getState().status).toBe("ready");
  expect(useCollectionStore.getState().tree?.data.basename).toBe("fixture-tree");
  expect(useCollectionStore.getState().counts).toEqual({});
  expect(paths.sort()).toEqual(["/api/images/aggregations", "/collections"]);
});