import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadBatchMembership } from "@/lib/browsing-context";
import { checkUploadAttempt, disposeUploadJobs, retainUploadBatches, submitUploadFiles, useUploadJobsStore } from "./upload-jobs-store";
import { observeGridUpload, observeUploadedImage, submitGridUpload } from "@/lib/upload-commands";
import { useLocalPersistenceStore } from "@/lib/local-batch-storage";

vi.mock("@/lib/upload-commands", () => ({ submitGridUpload: vi.fn(), observeGridUpload: vi.fn(), observeUploadedImage: vi.fn() }));
const file = (name: string, bytes = name) => Object.assign(new Blob([bytes]), { name }) as File;
afterEach(async () => {
  disposeUploadJobs();
  await Promise.resolve();
  useUploadJobsStore.setState({ batches: [] });
  uploadBatchMembership.setState({ batches: new Map() });
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("route-independent upload jobs", () => {
  it("retains older batches beyond five choices and keeps new work in memory when descriptor storage refuses writes", async () => {
    const stored = new Map<string, string>();
    let refuse = false;
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", { addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name) });
    vi.stubGlobal("sessionStorage", {
      get length() { return stored.size; }, key: (index: number) => [...stored.keys()][index] ?? null,
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { if (refuse) throw new DOMException("Quota", "QuotaExceededError"); stored.set(key, value); },
      removeItem: (key: string) => stored.delete(key),
    });
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "blocked", stage: "preparation" });
    try {
      const ids = Array.from({ length: 7 }, (_, index) => submitUploadFiles([file(`photo-${index}.jpg`)]));
      await vi.waitFor(() => expect(useUploadJobsStore.getState().batches.every(batch => batch.attempts[0].phase === "blocked")).toBe(true));
      const previous = new Map(stored);
      refuse = true;
      const latest = submitUploadFiles([file("latest.jpg")])!;
      await vi.waitFor(() => expect(useUploadJobsStore.getState().batches.at(-1)?.attempts[0].phase).toBe("blocked"));
      expect(stored).toEqual(previous);
      expect(ids.every(id => uploadBatchMembership.getState().batches.has(id!))).toBe(true);
      expect(useUploadJobsStore.getState().batches).toHaveLength(8);
      expect(useLocalPersistenceStore.getState().batchIssues[latest]).toBeTruthy();
      const leaving = { preventDefault: vi.fn(), returnValue: undefined };
      listeners.get("beforeunload")?.(leaving as unknown as Event);
      expect(leaving.preventDefault).toHaveBeenCalledOnce();
      refuse = false;
      retainUploadBatches();
      expect(useLocalPersistenceStore.getState().batchIssues[latest]).toBeUndefined();
      expect(stored.size).toBe(8);
      expect(submitGridUpload).toHaveBeenCalledTimes(8);
      expect(listeners.has("beforeunload")).toBe(false);
    } finally { disposeUploadJobs(); vi.unstubAllGlobals(); }
  });

  it("restores ordered known members and interrupted files after reload without replaying submissions", async () => {
    vi.useFakeTimers();
    const stored = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      get length() { return stored.size; }, key: (index: number) => [...stored.keys()][index] ?? null,
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key),
    });
    const readyId = "a".repeat(40);
    const pendingId = "b".repeat(40);
    vi.mocked(submitGridUpload).mockResolvedValueOnce({ outcome: "accepted", stage: "queued", imageId: readyId, queued: "rejected" })
      .mockResolvedValueOnce({ outcome: "accepted", stage: "transfer", imageId: readyId })
      .mockResolvedValueOnce({ outcome: "accepted", stage: "transfer", imageId: pendingId })
      .mockResolvedValueOnce({ outcome: "failed", stage: "preparation", reason: "File exceeds the configured upload size limit." });
    vi.mocked(observeGridUpload).mockImplementation(async id => ({ outcome: "status", status: id === readyId ? "COMPLETED" : "QUEUED" }));
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "visible" });
    const batchId = submitUploadFiles([file("z.jpg"), file("a.jpg"), file("pending.jpg"), file("too-large.jpg")])!;
    await vi.advanceTimersByTimeAsync(2_100);
    const revision = uploadBatchMembership.getState().batches.get(batchId)!.revision;
    disposeUploadJobs();
    vi.resetModules();
    const restored = await import("./upload-jobs-store");
    try {
      const batch = restored.useUploadJobsStore.getState().batches.find(item => item.id === batchId);
      expect(batch?.attempts.map(attempt => attempt.name)).toEqual(["a.jpg", "pending.jpg", "too-large.jpg", "z.jpg"]);
      expect(batch?.attempts.map(attempt => attempt.phase)).toEqual(["complete", "interrupted", "failed", "complete"]);
      expect(batch?.attempts.find(attempt => attempt.name === "too-large.jpg")?.message).toBe("File exceeds the configured upload size limit.");
      expect(batch?.attempts.find(attempt => attempt.name === "z.jpg")?.submission?.queued).toBe("rejected");
      const membership = (await import("@/lib/browsing-context")).uploadBatchMembership.getState().batches.get(batchId);
      expect(membership?.ids).toEqual([readyId]);
      expect(membership?.revision).toBe(revision);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(submitGridUpload).toHaveBeenCalledTimes(4);
    } finally {
      restored.disposeUploadJobs();
      restored.useUploadJobsStore.setState({ batches: [] });
      vi.unstubAllGlobals();
    }
  });

  it("finds a readable image after processing completed and its status record expired", async () => {
    vi.useFakeTimers();
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "accepted", stage: "transfer", imageId: "c".repeat(40) });
    vi.mocked(observeGridUpload).mockResolvedValueOnce({ outcome: "status", status: "COMPLETED" }).mockResolvedValue({ outcome: "missing" });
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "missing" });
    submitUploadFiles([file("later.jpg")]);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
    const attempt = useUploadJobsStore.getState().batches[0].attempts[0];
    expect(attempt.phase).toBe("uncertain");
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "visible" });
    checkUploadAttempt(attempt.id);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(useUploadJobsStore.getState().batches[0].attempts[0].imageId).toBe("c".repeat(40));
    expect(submitGridUpload).toHaveBeenCalledOnce();
  });

  it("retains interruption and partial receipts when an accepted result arrives after pagehide", async () => {
    let release!: (result: Awaited<ReturnType<typeof submitGridUpload>>) => void;
    vi.mocked(submitGridUpload).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    submitUploadFiles([file("interrupted.jpg")]);
    disposeUploadJobs();
    release({ outcome: "accepted", stage: "queued", imageId: "d".repeat(40), queued: "uncertain" });
    await vi.waitFor(() => expect(useUploadJobsStore.getState().batches[0].attempts[0].submission).toBeDefined());
    expect(useUploadJobsStore.getState().batches[0].attempts[0]).toMatchObject({
      phase: "uncertain", statusId: "d".repeat(40), submission: { queued: "uncertain" },
    });
  });

  it("protects an active transfer but releases unload protection after pre-transfer refusal", async () => {
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("sessionStorage", { length: 0, key: () => null, getItem: () => null, setItem: () => {} });
    vi.stubGlobal("window", { addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name) });
    let release!: (result: Awaited<ReturnType<typeof submitGridUpload>>) => void;
    vi.mocked(submitGridUpload).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    try {
      submitUploadFiles([file("blocked.jpg")]);
      const active = { preventDefault: vi.fn(), returnValue: undefined };
      listeners.get("beforeunload")?.(active as unknown as Event);
      expect(active.preventDefault).toHaveBeenCalledOnce();
      release({ outcome: "blocked", stage: "preparation" });
      await vi.waitFor(() => expect(useUploadJobsStore.getState().batches[0].attempts[0].phase).toBe("blocked"));
      const settled = { preventDefault: vi.fn(), returnValue: undefined };
      listeners.get("beforeunload")?.(settled as unknown as Event);
      expect(settled.preventDefault).not.toHaveBeenCalled();
    } finally { disposeUploadJobs(); vi.unstubAllGlobals(); }
  });

  it("retains same-name attempts, mixed outcomes and deduplicated canonical membership", async () => {
    vi.useFakeTimers();
    const id = "a".repeat(40);
    vi.mocked(submitGridUpload).mockResolvedValueOnce({ outcome: "accepted", stage: "queued", imageId: id, queued: "rejected" })
      .mockResolvedValueOnce({ outcome: "failed", stage: "transfer" })
      .mockResolvedValueOnce({ outcome: "accepted", stage: "transfer", imageId: id })
      .mockResolvedValueOnce({ outcome: "accepted", stage: "transfer", imageId: "e".repeat(40) });
    vi.mocked(observeGridUpload).mockResolvedValue({ outcome: "status", status: "COMPLETED" });
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "visible" });
    const batch = submitUploadFiles([file("same.jpg", "one"), file("same.jpg", "bad"), file("same.jpg", "one"), file("same.jpg", "two")])!;
    await vi.advanceTimersByTimeAsync(2_100);
    const attempts = useUploadJobsStore.getState().batches[0].attempts;
    expect(new Set(attempts.map(attempt => attempt.id)).size).toBe(4);
    expect(attempts.map(attempt => attempt.phase)).toEqual(["complete", "failed", "complete", "complete"]);
    expect(attempts[0].submission?.queued).toBe("rejected");
    expect(uploadBatchMembership.getState().batches.get(batch)?.ids).toEqual([id, "e".repeat(40)]);
  });

  it("keeps missing status uncertain and performs only reads on explicit reconciliation", async () => {
    vi.useFakeTimers();
    const id = "b".repeat(40);
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "accepted", stage: "transfer", imageId: id });
    vi.mocked(observeGridUpload).mockResolvedValueOnce({ outcome: "missing" }).mockResolvedValueOnce({ outcome: "status", status: "COMPLETED" });
    vi.mocked(observeUploadedImage).mockResolvedValueOnce({ outcome: "missing" }).mockResolvedValue({ outcome: "visible" });
    submitUploadFiles([file("missing.jpg")]);
    await vi.advanceTimersByTimeAsync(1);
    const attempt = useUploadJobsStore.getState().batches[0].attempts[0];
    expect(attempt.phase).toBe("uncertain");
    expect(attempt.statusId).toBe(id);
    checkUploadAttempt(attempt.id);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(useUploadJobsStore.getState().batches[0].attempts[0].phase).toBe("complete");
    expect(submitGridUpload).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});