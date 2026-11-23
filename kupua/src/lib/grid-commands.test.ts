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
  it("refuses label additions that cannot be addressed as members", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { executeGridCommand } = await import("./grid-commands");
    for (const input of [{ ...command, labels: ["."] }, { imageId: command.imageId, resource: command.resource,
      operation: "edit-label-list", add: [".."], remove: ["old"], clear: false }]) {
      expect(await executeGridCommand(input)).toEqual({ outcome: "blocked", reason: "invalid-command" });
    }
    expect(fetch).not.toHaveBeenCalled();
    const uri = `${metadataOrigin}/metadata/fixture/labels`;
    fetch.mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(Response.json({ data: { labels: { uri,
      data: ["desk", "."].map(data => ({ uri: `${uri}/${data}`, data })) } } }));
    expect(await executeGridCommand({ imageId: command.imageId, resource: command.resource,
      operation: "edit-label-list", add: [], remove: [], clear: true })).toEqual({ outcome: "blocked", reason: "unaddressable-label" });
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
  });
  it.each([401, 419, 403, 429, "network"])("retains label substeps after a later failure (%s)", async status => {
    const labels = `${metadataOrigin}/metadata/fixture/labels`;
    const writes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api") return root();
      if (url === "/grid-auth/session") return session();
      if (!init?.method) return Response.json({ data: { labels: { uri: labels,
        data: ["first", "second"].map(data => ({ data, uri: `${labels}/${data}` })) } } });
      writes.push(`${init.method} ${url}`);
      if (writes.length === 1) return new Response(null, { status: 204 });
      if (status === "network") throw Error("lost response");
      return new Response(null, { status: Number(status) });
    }));
    const { executeGridCommand } = await import("./grid-commands");
    const result = await executeGridCommand({ operation: "edit-label-list", imageId: command.imageId, resource: command.resource,
      clear: false, remove: ["first", "second"], add: ["third"] });
    expect(writes).toEqual(["DELETE /grid-metadata/metadata/fixture/labels/first", "DELETE /grid-metadata/metadata/fixture/labels/second"]);
    const uncertain = status === 429 || status === "network";
    expect(result).toMatchObject({ outcome: uncertain ? "unknown" : "partial", ...(status !== "network" && { status }),
      expected: { labels: uncertain ? [] : ["second"] }, labelSteps: { acknowledged: 1, rejected: uncertain ? 0 : 1, notSent: 1, uncertain: uncertain ? 1 : 0 } });
  });
  it.each(["network", "429"])("requires explicit syndication replacement and retains the expected leases after an uncertain POST (%s)", async failure => {
    const origin = "https://leases.example.test", path = "/leases/media/fixture";
    vi.stubEnv("VITE_HOSTED", "true");
    vi.stubGlobal("window", { __KUPUA_CONFIG__: { mediaApiUri: "https://api.example.test" } });
    const approvedId = "23a47def-4fea-44bb-b706-30bd5e145f31";
    let currentId = "399931dd-7069-40ef-b26c-30567b5341a1";
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://api.example.test") return Response.json({ links: [{ rel: "leases", href: origin }, { rel: "session", href: `${authOrigin}/session` }] });
      if (url === `${authOrigin}/session`) return session();
      if (url === "https://api.example.test/images/fixture") return Response.json({ data: { id: "fixture" },
        links: [...command.resource.links, { rel: "leases", href: origin + path }], actions: [{ name: "add-lease", method: "POST", href: `${origin}/leases` }] });
      if (url === origin + path) return Response.json({ data: { leases: [{ mediaId: "fixture", id: currentId, access: "allow-syndication" }] } });
      expect(url).toBe(`${origin}/leases`); expect(init?.method).toBe("POST"); writes++;
      if (failure === "network") throw Error("lost response");
      return new Response(null, { status: 429 });
    }));
    const { executeGridCommand } = await import("./grid-commands");
    const { leaseSetKey } = await import("./lease-change");
    const edit = (approvedLeaseId?: string) => executeGridCommand({ imageId: "fixture", resource: command.resource, operation: "edit-leases", value: { kind: "add", lease: { access: "deny-syndication" }, approvedLeaseId } });
    expect(await edit()).toEqual({ outcome: "blocked", reason: "unavailable" });
    expect(await edit(approvedId)).toEqual({ outcome: "blocked", reason: "unavailable" });
    expect(writes).toBe(0);
    currentId = approvedId;
    expect(await edit(approvedId)).toEqual({ outcome: "unknown", expectedLeases: leaseSetKey([{ access: "deny-syndication" }]), ...(failure === "429" && { status: 429 }) });
    expect(writes).toBe(1);
  });
  it("groups rights reads but releases each matching image independently", async () => {
    const { createRightsReadback } = await import("./metadata-operation");
    const { attachEnrichment } = await import("../stores/enrichment-store");
    const value = { category: "pay-to-use" } as const;
    const make = (id: string) => ({ imageId: id, resource: { links: [{ rel: "edits", href: `${metadataOrigin}/metadata/${id}` }] }, operation: "edit-rights" as const, value });
    const read = vi.fn(async (ids: string[]) => ids.map(id => {
      const image = { id, metadata: {}, uploadTime: "", uploadedBy: "", source: { mimeType: "image/jpeg", dimensions: { width: 1, height: 1 } },
        usageRights: value, userMetadata: { usageRights: id === "late" && ids.length === 2 ? {} : value, metadata: {} } };
      attachEnrichment(image, { resource: make(id).resource }); return image;
    }));
    const observe = createRightsReadback(read);
    vi.useFakeTimers();
    try {
      const first = observe(make("ready"), "[]"), later = vi.fn();
      const second = observe(make("late"), "[]").then(later);
      await vi.advanceTimersByTimeAsync(0);
      expect(await first).toBe(true); expect(later).not.toHaveBeenCalled();
      await vi.runAllTimersAsync(); await second;
      expect(later).toHaveBeenCalledWith(true);
      expect(read.mock.calls.map(([ids]) => ids)).toEqual([["ready", "late"], ["late"]]);
    } finally { vi.useRealTimers(); }
  });

  it.each([200, 403, "not visible"])("keeps rights acknowledgement separate from derived metadata (%s)", async status => {
    const path = "/metadata/fixture";
    const value = { category: "publisher-illustration", publication: "Daily", creator: "New contributor" };
    const writes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api") return root();
      if (url === "/grid-auth/session") return session();
      if (!init?.method) return Response.json({ data: { usageRights: { uri: `${metadataOrigin}${path}/usage-rights` },
        metadata: { data: {}, actions: [{ name: "set-from-usage-rights", method: "POST", href: `${metadataOrigin}${path}/metadata/set-from-usage-rights` }] } } });
      writes.push(`${init.method} ${url}`);
      if (init.method === "PUT") {
        expect(JSON.parse(String(init.body))).toEqual({ data: value });
        return Response.json({ data: value });
      }
      return Response.json({ data: { imageType: "Illustration", credit: "Daily", byline: "New contributor" } }, { status: Number(status) });
    }));
    const { executeGridCommand } = await import("./grid-commands");
    const observed = vi.fn(async () => {
      expect(writes).toEqual([`PUT /grid-metadata${path}/usage-rights`]);
      return status !== "not visible";
    });
    const result = await executeGridCommand({ imageId: command.imageId, resource: command.resource, operation: "edit-rights", value }, observed);
    expect(observed).toHaveBeenCalledOnce();
    expect(writes).toEqual([`PUT /grid-metadata${path}/usage-rights`, ...(status === "not visible" ? [] : [`POST /grid-metadata${path}/metadata/set-from-usage-rights`])]);
    expect(result).toMatchObject({ outcome: "acknowledged", metadataFromRights: status === "not visible" ? "not-sent" : status === 200 ? "acknowledged" : "rejected" });
  });

  it.each(["withdrawn", "changed", "same"] as const)("checks %s edit authority after a held source GET", async authority => {
    const { acceptImageOverlay, captureImageRead, stampImageRead, watchQueuedLabelTargets } = await import("./image-read-freshness");
    const { executeGridCommand } = await import("./grid-commands");
    const releaseTarget = watchQueuedLabelTargets([command.imageId])!;
    const accept = (links: typeof command.resource.links) => {
      const image = { id: command.imageId, metadata: {}, uploadTime: "", uploadedBy: "",
        source: { mimeType: "image/jpeg", dimensions: { width: 1, height: 1 } } };
      const overlay = { resource: { links } };
      stampImageRead(image, overlay, captureImageRead(), "lean");
      expect(acceptImageOverlay(image.id, overlay)).toBe(overlay);
      return overlay.resource;
    };
    const resource = accept(command.resource.links);
    const metadata = authority === "changed";
    const source = "/grid-metadata/metadata/fixture";
    let releaseSource!: (response: Response) => void;
    const transport = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api") return root();
      if (url === "/grid-auth/session") return session();
      if (url === "/api/images/fixture") return Response.json({ data: { id: "fixture", originalMetadata: {} }, links: resource.links });
      if (url === source && !init?.method) return new Promise<Response>(resolve => { releaseSource = resolve; });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", transport);
    try {
      const pending = executeGridCommand(metadata ? { operation: "edit-metadata", imageId: command.imageId, resource,
        fieldId: "metadata_credit", action: "overwrite", value: "New credit" } : { ...command, resource });
      await vi.waitFor(() => expect(releaseSource).toBeTypeOf("function"));
      accept(authority === "withdrawn" ? [] : authority === "changed"
        ? [{ rel: "edits", href: `${metadataOrigin}/metadata/replacement` }] : [...resource.links]);
      releaseSource(metadata ? Response.json({ data: { metadata: { uri: `${metadataOrigin}/metadata/fixture/metadata`, data: {} } } }) : edits());
      const result = await pending;
      expect(transport.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`)).toEqual([
        "GET /api", "GET /grid-auth/session", ...(metadata ? ["GET /api/images/fixture"] : []), `GET ${source}`,
        ...(authority === "same" ? [`POST ${source}/labels`] : []),
      ]);
      expect(result).toEqual(authority === "same" ? { outcome: "acknowledged" } : { outcome: "blocked", reason: "unavailable" });
    } finally { releaseTarget(); }
  });

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