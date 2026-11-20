import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const metadataOrigin = "https://metadata.example.test";
const authOrigin = "https://auth.example.test";
const command = {
  operation: "add-labels",
  imageId: "fixture",
  resource: { links: [{ rel: "edits", href: `${metadataOrigin}/metadata/fixture` }] },
  labels: ["fixture label"],
};
const root = () => Response.json({ links: [{ rel: "edits", href: metadataOrigin }, { rel: "session", href: `${authOrigin}/session` }] });
const session = () => Response.json({ data: { user: { permissions: {} } } });
const edits = (uri = `${metadataOrigin}/metadata/fixture/labels`) => Response.json({ data: { labels: { uri, data: [] } } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  vi.stubGlobal("localStorage", { getItem: () => "true" });
  vi.stubEnv("VITE_GRID_METADATA_ORIGIN", metadataOrigin);
  vi.stubEnv("VITE_GRID_AUTH_ORIGIN", authOrigin);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Grid command admission", () => {
  it.each(["evidence", "missing-evidence", "dispose", "overwrite"] as const)("orders metadata writes while confirmation is held (%s)", async mode => {
    const withEvidence = mode !== "missing-evidence";
    const initial = { credit: "Initial credit", domainMetadata: { desk: { reference: "Keep" } } };
    let stored: Record<string, unknown> = structuredClone(initial);
    let writes = 0;
    let staleReads = 2;
    let acknowledge!: () => void;
    let releaseRead!: () => void;
    let releaseOriginal!: () => void;
    const acknowledgement = new Promise<void>(resolve => { acknowledge = resolve; });
    const heldRead = new Promise<void>(resolve => { releaseRead = resolve; });
    const heldOriginal = new Promise<void>(resolve => { releaseOriginal = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body)).data;
        if (++writes === 1) await acknowledgement;
        return withEvidence ? Response.json({ data: stored }) : new Response(null, { status: 200 });
      }
      if (url === "/api") return root();
      if (url === "/grid-auth/session") return session();
      if (url === "/api/images/fixture") {
        if (writes === 1 && mode === "dispose") await heldOriginal;
        return Response.json({ data: { id: "fixture", originalMetadata: {} }, links: command.resource.links });
      }
      return Response.json({ data: { metadata: { uri: `${metadataOrigin}/metadata/fixture/metadata`,
        data: writes === 1 && staleReads-- > 0 ? initial : stored } } });
    }));
    const { executeGridCommand } = await import("./grid-commands");
    const { createMetadataEditorStore } = await import("../stores/metadata-editor-store");
    const { captureImageRead, stampImageRead, getMetadataWriteWitness } = await import("./image-read-freshness");
    const { attachEnrichment } = await import("../stores/enrichment-store");
    let reads = 0;
    const publishImages = vi.fn();
    const editor = createMetadataEditorStore(executeGridCommand, {
      readImages: async () => {
        const read = ++reads;
        const staleIndex = withEvidence && read === 3;
        const image = { id: "fixture", metadata: structuredClone(staleIndex ? initial : stored),
          userMetadata: { metadata: structuredClone(staleIndex ? initial : stored), lastModified: `2026-11-19T12:00:0${staleIndex ? 0 : writes}Z` },
          uploadTime: "", uploadedBy: "", source: { mimeType: "image/jpeg", dimensions: { width: 1, height: 1 } } };
        const overlay = { resource: command.resource };
        stampImageRead(image, overlay, captureImageRead(), "lean");
        attachEnrichment(image, overlay);
        if (read === 2) await heldRead;
        return [image];
      }, publishImages,
    });
    vi.useFakeTimers();
    try {
      const first = editor.getState().submit({ fieldId: "metadata_description", action: "overwrite", value: "Saved description", targetIds: ["fixture"] })!;
      await vi.advanceTimersByTimeAsync(0);
      const second = editor.getState().submit({ fieldId: mode === "overwrite" ? "metadata_description" : "metadata_credit", action: "overwrite",
        value: mode === "overwrite" ? "New description" : "New credit", targetIds: ["fixture"] })!;
      await vi.advanceTimersByTimeAsync(0);
      expect(writes).toBe(1);
      acknowledge();
      await vi.advanceTimersByTimeAsync(500);
      if (mode === "dispose") {
        expect(writes).toBe(1);
        staleReads = Infinity;
        editor.getState().dispose();
        releaseOriginal(); releaseRead();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(writes).toBe(1);
        expect(stored).toEqual({ ...initial, description: "Saved description" });
        return;
      }
      expect(writes).toBe(withEvidence ? 2 : 1);
      if (withEvidence) expect(editor.getState().saves.get(second)?.items).toMatchObject([{ observation: "observed" }]);
      releaseRead();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(writes).toBe(2);
      expect(stored).toEqual(mode === "overwrite" ? { ...initial, description: "New description" }
        : { ...initial, credit: "New credit", description: "Saved description" });
      expect(editor.getState().saves.get(first)?.items).toMatchObject([{ observation: mode === "overwrite" ? "superseded" : "observed" }]);
      expect(editor.getState().saves.get(second)?.items).toMatchObject([{ observation: "observed" }]);
      expect(publishImages.mock.calls.flatMap(([batch]) => batch).at(-1)?.metadata).toEqual(stored);
      expect(getMetadataWriteWitness("fixture")).toBeUndefined();
    } finally { acknowledge(); releaseRead(); releaseOriginal(); editor.getState().dispose(); vi.useRealTimers(); }
  });

  it("compares metadata evidence without collapsing ordered values or explicit clears", async () => {
    const { metadataWriteFingerprint: fingerprint } = await import("./grid-commands");
    expect(fingerprint({ keywords: ["b", "a"], dateTaken: "2026-11-19T12:00:00+01:00" }))
      .toBe(fingerprint({ dateTaken: "2026-11-19T11:00:00.000Z", keywords: ["a", "b"] }));
    expect(fingerprint({ subjects: ["a", "b"] })).not.toBe(fingerprint({ subjects: ["b", "a"] }));
    expect(fingerprint({ description: "", keywords: [] })).not.toBe(fingerprint({}));
    expect(fingerprint({ domainMetadata: { desk: { reference: null } } })).toBeUndefined();
  });

  it("bounds stale override reads before a successor and never replays its predecessor", async () => {
    const original = { credit: "Before", keywords: ["Zulu", "Alpha"], domainMetadata: { desk: { reference: "Keep" } } };
    let stored: Record<string, unknown> = structuredClone(original);
    let staleReads = 0;
    let reads = 0;
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body)).data;
        return Response.json({ data: stored });
      }
      if (url === "/api") return root();
      if (url === "/grid-auth/session") return session();
      if (url === "/api/images/fixture") return Response.json({ data: { id: "fixture", originalMetadata: {} }, links: command.resource.links });
      reads++;
      const overrides = staleReads-- > 0 ? original : { ...Object.fromEntries(Object.entries(stored).reverse()), keywords: ["Alpha", "Zulu"] };
      return Response.json({ data: { metadata: { uri: `${metadataOrigin}/metadata/fixture/metadata`, data: overrides } } });
    });
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    const { admitLabelObservation, recordLabelOutcome, releaseLabelObservation, watchQueuedLabelTargets } = await import("./image-read-freshness");
    const releaseTargets = watchQueuedLabelTargets(["fixture"])!;
    const edit = (fieldId: string, value: string) => executeGridCommand({ operation: "edit-metadata", imageId: "fixture",
      resource: command.resource, fieldId, action: "overwrite", value });
    const first = admitLabelObservation(["fixture"]);
    if (typeof first !== "number") throw new Error("Expected admission");
    const description = await edit("metadata_description", "Saved description");
    expect(description).toHaveProperty("metadataWitness", expect.any(String));
    if (description.outcome !== "acknowledged") throw new Error("Expected acknowledgement");
    recordLabelOutcome(first, "fixture", description.outcome, description.metadataWitness);
    releaseLabelObservation(first);
    const second = admitLabelObservation(["fixture"]);
    if (typeof second !== "number") throw new Error("Expected admission");
    vi.useFakeTimers();
    try {
      reads = 0;
      staleReads = 2;
      const pending = edit("metadata_credit", "New credit");
      await vi.advanceTimersByTimeAsync(500);
      const credit = await pending;
      expect(credit).toMatchObject({ outcome: "acknowledged" });
      expect(reads).toBe(3);
      expect(stored).toEqual({ ...original, keywords: ["Alpha", "Zulu"], credit: "New credit", description: "Saved description" });
      if (credit.outcome !== "acknowledged") throw new Error("Expected acknowledgement");
      recordLabelOutcome(second, "fixture", credit.outcome, credit.metadataWitness);
      releaseLabelObservation(second);
      admitLabelObservation(["fixture"]);
      reads = 0;
      staleReads = Infinity;
      const refused = edit("metadata_byline", "Must remain unsent");
      await vi.advanceTimersByTimeAsync(500);
      expect(await refused).toMatchObject({ outcome: "blocked", reason: "unavailable" });
      expect(reads).toBe(3);
      expect(transport.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2);
    } finally { releaseTargets(); vi.useRealTimers(); }
  });

  it("preserves authoritative metadata across clear, location, list and conditional filename changes without replay", async () => {
    const original = { description: "Embedded", city: "London", country: "UK", keywords: ["Original", "News, features"] };
    let overrides: Record<string, unknown> = { credit: "Keep credit", domainMetadata: { desk: { reference: "keep" } } };
    let lost = false;
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        overrides = JSON.parse(String(init.body)).data;
        if (lost) throw new TypeError("Synthetic lost response");
        return new Response(null, { status: 200 });
      }
      if (url === "/api") return root();
      if (url === "/grid-auth/session") return session();
      if (url === "/api/images/fixture") return Response.json({ data: { id: "fixture", originalMetadata: original }, links: command.resource.links });
      return Response.json({ data: { metadata: { uri: `${metadataOrigin}/metadata/fixture/metadata`, data: overrides } } });
    });
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    const edit = (fieldId: string, value: unknown, action = "overwrite") => executeGridCommand({
      operation: "edit-metadata", imageId: "fixture", resource: command.resource, fieldId, value, action,
    });
    expect((await edit("metadata_description", "")).outcome).toBe("acknowledged");
    expect(overrides.description).toBe("");
    await edit("location", { city: "Paris" });
    expect(overrides.city).toBe("Paris");
    expect(overrides).not.toHaveProperty("country");
    await edit("metadata_keywords", "News, features", "remove");
    expect(overrides.keywords).toEqual(["Original"]);
    await edit("metadata_peopleInImage", "A person", "add");
    expect(overrides.peopleInImage).toEqual(["A person"]);
    await edit("metadata_description", "submitted.jpg", "if-empty");
    expect(overrides.description).toBe("submitted.jpg");
    const writes = () => transport.mock.calls.filter(([, init]) => init?.method === "PUT").length;
    const before = writes();
    expect((await edit("metadata_description", "duplicate.jpg", "if-empty")).outcome).toBe("unchanged");
    expect((await edit("metadata_dateTaken", "")).outcome).toBe("blocked");
    expect(writes()).toBe(before);
    lost = true;
    await expect(edit("metadata_description", "Suffix", "append")).resolves.toEqual({ outcome: "unknown", expected: { description: "submitted.jpg Suffix" } });
    expect(writes()).toBe(before + 1);
    expect(overrides.credit).toBe("Keep credit");
    expect(overrides.domainMetadata).toEqual({ desk: { reference: "keep" } });
  });

  it("changes one metadata field using fresh originals and overrides without replacing unrelated values", async () => {
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(null, { status: 200 });
      if (url === "/api") return root();
      if (url === "/grid-auth/session") return session();
      if (url === "/api/images/fixture") return Response.json({ data: { id: "fixture",
        originalMetadata: { byline: "Original author", credit: "Original credit" } }, links: command.resource.links });
      if (url === "/grid-metadata/metadata/fixture") return Response.json({ data: { metadata: {
        uri: `${metadataOrigin}/metadata/fixture/metadata`,
        data: { byline: "Earlier author", credit: "Fresh credit", domainMetadata: { desk: { reference: "keep" } } },
      } } });
      throw new Error(`Unexpected fixture request: ${url}`);
    });
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand({ operation: "edit-metadata", imageId: "fixture", resource: command.resource,
      fieldId: "metadata_byline", action: "overwrite", value: "Original author" })).resolves.toMatchObject({ outcome: "acknowledged" });
    expect(transport).toHaveBeenLastCalledWith("/grid-metadata/metadata/fixture/metadata", expect.objectContaining({
      method: "PUT", credentials: "include", redirect: "error",
      body: JSON.stringify({ data: { credit: "Fresh credit", domainMetadata: { desk: { reference: "keep" } } } }),
    }));
  });

  it("uses discovered hosted services without injected addresses or rollout flags", async () => {
    vi.stubEnv("VITE_HOSTED", "true");
    vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "");
    vi.stubEnv("VITE_GRID_AUTH_ORIGIN", "");
    vi.stubGlobal("window", { __KUPUA_CONFIG__: { mediaApiUri: "https://api.example.test" } });
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ links: [
      { rel: "edits", href: metadataOrigin }, { rel: "session", href: `${authOrigin}/session` },
    ] })).mockResolvedValueOnce(session()).mockResolvedValueOnce(edits())
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand(command)).resolves.toEqual({ outcome: "acknowledged" });
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test", `${authOrigin}/session`, `${metadataOrigin}/metadata/fixture`,
      `${metadataOrigin}/metadata/fixture/labels`,
    ]);
  });

  it("captures one saved preference at startup and applies changes only after reload", async () => {
    let saved: string | null = "true";
    vi.stubGlobal("localStorage", { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { gridLabelEditingEnabled } = await import("./grid-commands");
    const { saveEditingPreference } = await import("./editing-preference");
    expect(gridLabelEditingEnabled()).toBe(true);
    expect(saveEditingPreference(false)).toBe(true);
    expect(gridLabelEditingEnabled()).toBe(true);
    vi.resetModules();
    const reloaded = await import("./grid-commands");
    expect(reloaded.gridLabelEditingEnabled()).toBe(false);
    expect((await reloaded.executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
  });

  it("reports an already absent label as unchanged without sending a mutation", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(edits());
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand({ operation: "remove-label", imageId: command.imageId,
      resource: command.resource, label: "news" })).resolves.toEqual({ outcome: "unchanged" });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("removes only the exact advertised label resource and refuses absent or mismatched capabilities", async () => {
    const label = "news / + % ? #";
    const uri = `${metadataOrigin}/metadata/fixture/labels/news+%2F+%2B+%25+%3F+%23`;
    const removal = { operation: "remove-label", imageId: command.imageId, resource: command.resource, label };
    const response = (data: unknown[]) => Response.json({ data: { labels: { uri: `${metadataOrigin}/metadata/fixture/labels`, data } } });
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(response([{ uri, data: label }])).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand(removal)).resolves.toEqual({ outcome: "acknowledged" });
    expect(transport).toHaveBeenLastCalledWith(uri.replace(metadataOrigin, "/grid-metadata"), expect.objectContaining({
      method: "DELETE", credentials: "include", redirect: "error",
    }));
    expect(transport.mock.calls.at(-1)?.[1].body).toBeUndefined();
    for (const data of [[{ data: label }],
      [{ uri: uri.replace("/fixture/", "/other/"), data: label }], [{ uri: uri.replace(metadataOrigin, "https://other.example.test"), data: label }]]) {
      transport.mockResolvedValueOnce(response(data));
      await expect(executeGridCommand(removal)).resolves.toMatchObject({ outcome: "blocked" });
    }
    expect(transport.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  });

  it("bounds discovery already started by the page without replay or late dispatch", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const transport = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    }));
    vi.stubGlobal("fetch", transport);
    const { initGridApi } = await import("./grid-api-instance");
    const initialization = initGridApi();
    const { executeGridCommand } = await import("./grid-commands");
    const pending = executeGridCommand(command);
    expect(timeout).toHaveBeenCalledWith(15_000);
    deadline.abort();
    await initialization;
    expect((await pending).outcome).toBe("blocked");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).toHaveBeenCalledOnce();
  });

  it("adds labels only through the authoritative collection, with credentials and no redirects", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(edits()).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand(command)).resolves.toEqual({ outcome: "acknowledged" });
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "/api", "/grid-auth/session", "/grid-metadata/metadata/fixture", "/grid-metadata/metadata/fixture/labels",
    ]);
    expect(transport).toHaveBeenLastCalledWith("/grid-metadata/metadata/fixture/labels", expect.objectContaining({
      method: "POST", credentials: "include", redirect: "error", body: JSON.stringify({ data: command.labels }),
    }));
  });

  it("refuses malformed and direct-ES commands even with a saved enabled preference", async () => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    for (const invalid of [{ ...command, operation: "delete" }, { ...command, method: "DELETE" }, { ...command, labels: [] }]) {
      expect(await executeGridCommand(invalid)).toEqual({ outcome: "blocked", reason: "invalid-command" });
    }
    vi.stubEnv("VITE_USE_MEDIA_API", "false");
    expect(await executeGridCommand(command)).toEqual({ outcome: "blocked", reason: "disabled" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("defaults off when storage is absent or inaccessible", async () => {
    const storage = vi.fn().mockReturnValue(null);
    vi.stubGlobal("localStorage", { getItem: storage });
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    expect(await executeGridCommand(command)).toEqual({ outcome: "blocked", reason: "disabled" });
    storage.mockImplementation(() => { throw new Error("Storage unavailable"); });
    const { readEditingPreference } = await import("./editing-preference");
    expect(readEditingPreference()).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses unavailable directory services and mismatched local proxy targets", async () => {
    for (const links of [[], [{ rel: "edits", href: "http://metadata.example.test" }],
      [{ rel: "edits", href: metadataOrigin }, { rel: "session", href: `${authOrigin}/wrong` }]]) {
      vi.resetModules();
      const transport = vi.fn().mockResolvedValueOnce(Response.json({ links }));
      vi.stubGlobal("fetch", transport);
      const { executeGridCommand } = await import("./grid-commands");
      expect((await executeGridCommand(command)).outcome).toBe("blocked");
      expect(transport).toHaveBeenCalledOnce();
    }
    vi.resetModules();
    vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "https://other.example.test");
    const transport = vi.fn().mockResolvedValueOnce(root());
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    expect(await executeGridCommand(command)).toEqual({ outcome: "blocked", reason: "invalid-command" });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("never follows a foreign labels resource or replays a lost write response", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(edits("https://other.example.test/metadata/fixture/labels"));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).toHaveBeenCalledTimes(3);
    transport.mockResolvedValueOnce(edits()).mockRejectedValueOnce(new TypeError("connection lost"));
    await expect(executeGridCommand(command)).resolves.toEqual({ outcome: "unknown" });
    expect(transport).toHaveBeenCalledTimes(5);
  });

  it.each([
    [429, { outcome: "unknown", status: 429 }],
    [503, { outcome: "unknown" }],
    [403, { outcome: "rejected", status: 403, errorKey: "permission-denied" }],
  ])("classifies HTTP %s without replaying the submitted write", async (status, expected) => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(Response.json({ data: { labels: { uri: `${metadataOrigin}/metadata/fixture/labels`,
        data: [{ uri: `${metadataOrigin}/metadata/fixture/labels/news`, data: "news" }] } } }))
      .mockResolvedValueOnce(Response.json({ errorKey: "permission-denied" }, { status: status as number }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand({ operation: "remove-label", imageId: command.imageId, resource: command.resource, label: "news" })).resolves.toEqual(expected);
    expect(transport.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("stops pending and later submissions after expiry, even when a cached session was valid", async () => {
    let release!: (value: Response) => void;
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(edits()).mockResolvedValueOnce(Response.json({ errorKey: "authentication-expired" }, { status: 419 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    const pending = executeGridCommand(command);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
    expect((await executeGridCommand(command)).outcome).toBe("rejected");
    release(edits());
    expect((await pending).outcome).toBe("blocked");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).toHaveBeenCalledTimes(5);
    const { getGridSessionPermissions } = await import("./grid-api-instance");
    await expect(getGridSessionPermissions()).resolves.toBeNull();
  });

});