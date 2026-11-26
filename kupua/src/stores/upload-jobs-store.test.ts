import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadBatchMembership } from "@/lib/browsing-context";
import { acknowledgeUploadNavigation, checkUploadAttempt, configureUploadFollowups, dismissUploadAttempt, disposeUploadJobs, retainUploadBatches, submitUploadFiles, useUploadJobsStore, useUploadPresets } from "./upload-jobs-store";
import { observeGridUpload, observeUploadedImage, submitGridUpload } from "@/lib/upload-commands";
import { useLocalPersistenceStore } from "@/lib/local-batch-storage";

it("reports owned followup transitions but not unrelated metadata activity", async () => {
  const { createMetadataEditorStore, reportUploadFollowups } = await import("./metadata-editor-store");
  const editor = createMetadataEditorStore();
  const save = { id: 1, state: "queued", items: [], excluded: 0, intent: { fieldId: "metadata_description", action: "if-empty", value: "Caption", targetIds: ["upload"] } } as const;
  editor.setState({ saves: new Map([[1, save]]) });
  const report = vi.fn();
  try {
    report.mockImplementationOnce(() => {
      editor.setState({ saves: new Map(editor.getState().saves).set(2, { ...save, id: 2 }) });
      expect(report).toHaveBeenCalledTimes(1);
      editor.setState({ saves: new Map(editor.getState().saves).set(1, { ...save, state: "finished", message: "Save unavailable" }) });
    });
    reportUploadFollowups(editor, [{ id: 1, label: "Filename" }], report);
    expect(report.mock.calls[0][0][0].pending).toBe(true);
    expect(report.mock.lastCall?.[0]).toEqual([{ label: "Filename", pending: false, attention: true, summary: "Save unavailable" }]);
    editor.setState({ saves: new Map() });
    expect(report).toHaveBeenCalledTimes(2);
  } finally { editor.getState().dispose(); }
});

vi.mock("@/lib/upload-commands", () => ({ submitGridUpload: vi.fn(), observeGridUpload: vi.fn(), observeUploadedImage: vi.fn() }));
const file = (name: string, bytes = name) => Object.assign(new Blob([bytes]), { name }) as File;
afterEach(async () => {
  disposeUploadJobs();
  configureUploadFollowups(undefined);
  useUploadPresets.setState({ labels: [] });
  await Promise.resolve();
  useUploadJobsStore.setState({ batches: [], activityAttemptIds: new Set() });
  uploadBatchMembership.setState({ batches: new Map() });
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("route-independent upload jobs", () => {
  it("stops only the active transfer and continues the queue without replay", async () => {
    vi.useFakeTimers();
    vi.mocked(submitGridUpload).mockImplementationOnce(async (_file, progress, signal) => {
      progress("transfer", "a".repeat(40));
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
      return { outcome: "uncertain", stage: "transfer", imageId: "a".repeat(40) };
    }).mockResolvedValue({ outcome: "accepted", stage: "transfer", imageId: "b".repeat(40) });
    vi.mocked(observeGridUpload).mockResolvedValue({ outcome: "visible" });
    submitUploadFiles([file("a.jpg"), file("b.jpg")]);
    const { stopUploadTransfer } = await import("./upload-jobs-store");
    stopUploadTransfer(useUploadJobsStore.getState().batches[0].attempts[0].id);
    await vi.advanceTimersByTimeAsync(1);
    const [stopped, next] = useUploadJobsStore.getState().batches[0].attempts;
    expect(stopped).toMatchObject({ phase: "uncertain", statusId: "a".repeat(40) });
    expect(next.phase).toBe("complete");
    expect(submitGridUpload).toHaveBeenCalledTimes(2);
  });
  it("starts uploads in current batch filename order even when the picker returns them out of order", async () => {
    vi.useFakeTimers();
    vi.mocked(submitGridUpload).mockImplementation(async input => ({
      outcome: "accepted", stage: "transfer", imageId: input.name[0].repeat(40),
    }));
    vi.mocked(observeGridUpload).mockResolvedValue({ outcome: "visible" });
    const id = submitUploadFiles([file("c.jpg"), file("b.jpg"), file("a.jpg")]);
    await vi.advanceTimersByTimeAsync(1);
    const attempts = useUploadJobsStore.getState().batches.find(batch => batch.id === id)?.attempts;
    expect(vi.mocked(submitGridUpload).mock.calls.map(([input]) => input.name)).toEqual(attempts?.map(attempt => attempt.name));
    expect(attempts?.map(attempt => attempt.name)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("captures submission presets once and retains separate uncertain follow-up activity without replay", async () => {
    vi.useFakeTimers();
    const imageId = "e".repeat(40);
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "accepted", stage: "transfer", imageId });
    vi.mocked(observeGridUpload).mockResolvedValue({ outcome: "status", status: "COMPLETED" });
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "visible" });
    const followups = vi.fn<Parameters<typeof configureUploadFollowups>[0] extends infer Callback ? NonNullable<Callback> : never>();
    configureUploadFollowups(followups);
    useUploadPresets.setState({ labels: ["Captured"] });
    submitUploadFiles([file("submitted-name.jpg")]);
    useUploadPresets.setState({ labels: ["Later preset"] });
    await vi.advanceTimersByTimeAsync(1);
    expect(observeUploadedImage).toHaveBeenCalledExactlyOnceWith(imageId, expect.any(AbortSignal));
    expect(followups).toHaveBeenCalledExactlyOnceWith(imageId, "submitted-name.jpg", ["Captured"], expect.any(Function));
    const report = followups.mock.calls[0][3];
    const attempt = useUploadJobsStore.getState().batches[0].attempts[0];
    expect(attempt.phase).toBe("complete");
    const persist = vi.fn();
    vi.stubGlobal("sessionStorage", { length: 0, setItem: persist });
    try {
      const saving = { label: "Filename description", summary: "Saving", pending: true, attention: false };
      report([saving]);
      report([{ ...saving }]);
      report([{ ...saving, summary: "Saving: 0/1 visible" }]);
      expect(persist).toHaveBeenCalledTimes(1);
      acknowledgeUploadNavigation();
      expect(useUploadJobsStore.getState().activityAttemptIds.size).toBe(1);
      report([{ ...saving, summary: "Uncertain", pending: false, attention: true }]);
      expect(persist).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
    acknowledgeUploadNavigation();
    expect(useUploadJobsStore.getState().activityAttemptIds.size).toBe(1);
    checkUploadAttempt(attempt.id);
    await vi.advanceTimersByTimeAsync(1);
    expect(followups).toHaveBeenCalledOnce();
    dismissUploadAttempt(attempt.id);
    expect(useUploadJobsStore.getState().activityAttemptIds.size).toBe(0);
    expect(submitGridUpload).toHaveBeenCalledOnce();
  });

  it.each([{ labels: [] }, { labels: ["Preset"] }])("preserves an existing description while still submitting captured presets ($labels)", async ({ labels }) => {
    vi.useFakeTimers();
    const imageId = "d".repeat(40);
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "accepted", stage: "transfer", imageId });
    vi.mocked(observeGridUpload).mockResolvedValue({ outcome: "status", status: "COMPLETED" });
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "visible", hasDescription: true });
    const presetReport = { label: "Preset", summary: "Saved", pending: false, attention: false };
    const followups = vi.fn<NonNullable<Parameters<typeof configureUploadFollowups>[0]>>(
      (_imageId, _filename, _labels, report) => report([presetReport]));
    configureUploadFollowups(followups);
    useUploadPresets.setState({ labels });
    submitUploadFiles([file("keep-caption.jpg")]);
    await vi.advanceTimersByTimeAsync(1);
    if (labels.length) expect(followups).toHaveBeenCalledExactlyOnceWith(imageId, undefined, labels, expect.any(Function));
    else expect(followups).not.toHaveBeenCalled();
    expect(useUploadJobsStore.getState().batches[0].attempts[0].followups).toEqual([
      { label: "Filename description", summary: "Existing description preserved", pending: false, attention: false },
      ...(labels.length ? [presetReport] : []),
    ]);
  });

  it("logs a queued rejection once without concealing a later processing failure", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "accepted", stage: "queued", imageId: "4".repeat(40), queued: "rejected" });
    vi.mocked(observeGridUpload).mockResolvedValue({ outcome: "failed" });
    try {
      submitUploadFiles([file("processing-failure.jpg")]);
      await vi.advanceTimersByTimeAsync(1);
      expect(errors).toHaveBeenCalledTimes(2);
      expect(errors).toHaveBeenCalledWith("[Upload]", expect.objectContaining({ stage: "queued", message: "Queued status update rejected." }));
      expect(errors).toHaveBeenCalledWith("[Upload]", expect.objectContaining({ stage: "processing", message: "The loader reports processing failed." }));
    } finally { errors.mockRestore(); }
  });

  it("keeps only the current activity round, preserves running work through navigation and acknowledges individual errors without deleting history", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const firstId = "1".repeat(40);
    const secondId = "2".repeat(40);
    useUploadJobsStore.setState({ batches: [{ id: "local-old", createdAt: 1, attempts: [
      { id: "old-success", name: "old.jpg", size: 1, phase: "complete", imageId: "0".repeat(40) },
    ] }] });
    vi.mocked(submitGridUpload).mockResolvedValueOnce({ outcome: "accepted", stage: "transfer", imageId: firstId })
      .mockResolvedValueOnce({ outcome: "accepted", stage: "transfer", imageId: secondId })
      .mockResolvedValueOnce({ outcome: "failed", stage: "transfer", imageId: "3".repeat(40), reason: "Synthetic transfer rejection." });
    vi.mocked(observeGridUpload).mockResolvedValue({ outcome: "status", status: "COMPLETED" });
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "visible" });
    try {
      submitUploadFiles([file("first.jpg")]);
      submitUploadFiles([file("second.jpg")]);
      expect(useUploadJobsStore.getState().activityAttemptIds.size).toBe(2);
      acknowledgeUploadNavigation();
      expect(useUploadJobsStore.getState().activityAttemptIds.size).toBe(2);
      await vi.advanceTimersByTimeAsync(2_100);
      expect(useUploadJobsStore.getState().activityAttemptIds.has("old-success")).toBe(false);
      expect(errors).not.toHaveBeenCalled();
      const previousRound = [...useUploadJobsStore.getState().activityAttemptIds];
      const batchId = submitUploadFiles([file("failed.jpg")])!;
      await vi.advanceTimersByTimeAsync(1);
      expect(previousRound.some(id => useUploadJobsStore.getState().activityAttemptIds.has(id))).toBe(false);
      const attempt = useUploadJobsStore.getState().batches.find(batch => batch.id === batchId)!.attempts[0];
      acknowledgeUploadNavigation();
      expect(useUploadJobsStore.getState().activityAttemptIds.has(attempt.id)).toBe(true);
      expect(errors).toHaveBeenCalledWith("[Upload]", expect.objectContaining({
        filename: "failed.jpg", mediaId: "3".repeat(40), message: "Synthetic transfer rejection.",
      }));
      vi.mocked(submitGridUpload).mockResolvedValueOnce({ outcome: "accepted", stage: "transfer", imageId: "4".repeat(40) });
      submitUploadFiles([file("next-round.jpg")]);
      expect(useUploadJobsStore.getState().activityAttemptIds.has(attempt.id)).toBe(true);
      await vi.advanceTimersByTimeAsync(2_100);
      dismissUploadAttempt(attempt.id);
      expect(useUploadJobsStore.getState().activityAttemptIds.size).toBe(1);
      acknowledgeUploadNavigation();
      expect(useUploadJobsStore.getState().activityAttemptIds.size).toBe(0);
      expect(useUploadJobsStore.getState().batches.find(batch => batch.id === batchId)?.attempts[0])
        .toMatchObject({ phase: "failed", notificationDismissed: true });
    } finally { errors.mockRestore(); }
  });

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
    vi.mocked(submitGridUpload).mockImplementation(async input => {
      if (input.name === "too-large.jpg") return { outcome: "failed", stage: "preparation", reason: "File exceeds the configured upload size limit." };
      if (input.name === "z.jpg") return { outcome: "accepted", stage: "queued", imageId: readyId, queued: "rejected" };
      return { outcome: "accepted", stage: "transfer", imageId: input.name === "pending.jpg" ? pendingId : readyId };
    });
    vi.mocked(observeGridUpload).mockImplementation(async id => ({ outcome: "status", status: id === readyId ? "COMPLETED" : "QUEUED" }));
    vi.mocked(observeUploadedImage).mockResolvedValue({ outcome: "visible" });
    const followup = vi.fn((_id: string, name: string | undefined, _labels: readonly string[], report: (items: readonly { label: string; summary: string; pending: boolean; attention: boolean }[]) => void) => {
      report([{ label: "private preset", summary: "Not saved", pending: false, attention: name === "z.jpg" }]);
    });
    configureUploadFollowups(followup);
    const batchId = submitUploadFiles([file("z.jpg"), file("a.jpg"), file("pending.jpg"), file("too-large.jpg")])!;
    await vi.advanceTimersByTimeAsync(2_100);
    dismissUploadAttempt(useUploadJobsStore.getState().batches.find(batch => batch.id === batchId)!.attempts.find(attempt => attempt.name === "too-large.jpg")!.id);
    const revision = uploadBatchMembership.getState().batches.get(batchId)!.revision;
    disposeUploadJobs();
    vi.resetModules();
    const restored = await import("./upload-jobs-store");
    try {
      const batch = restored.useUploadJobsStore.getState().batches.find(item => item.id === batchId);
      expect(batch?.attempts.map(attempt => attempt.name)).toEqual(["a.jpg", "pending.jpg", "too-large.jpg", "z.jpg"]);
      expect(batch?.attempts.map(attempt => attempt.phase)).toEqual(["complete", "interrupted", "failed", "complete"]);
      expect(batch?.attempts.find(attempt => attempt.name === "too-large.jpg")?.message).toBe("File exceeds the configured upload size limit.");
      const dismissed = batch?.attempts.find(attempt => attempt.name === "too-large.jpg");
      expect(dismissed?.notificationDismissed).toBe(true);
      expect(restored.useUploadJobsStore.getState().activityAttemptIds.has(dismissed!.id)).toBe(false);
      expect(batch?.attempts.find(attempt => attempt.name === "z.jpg")?.submission?.queued).toBe("rejected");
      const affected = batch!.attempts.find(attempt => attempt.name === "z.jpg")!;
      expect(restored.useUploadJobsStore.getState().activityAttemptIds.has(affected.id)).toBe(true);
      expect(restored.uploadAttention(affected)).toBe(true);
      expect([...stored.values()].join("")).not.toContain("private preset");
      expect(followup).toHaveBeenCalledTimes(2);
      const membership = (await import("@/lib/browsing-context")).uploadBatchMembership.getState().batches.get(batchId);
      expect(membership?.ids).toEqual([readyId]);
      expect(membership?.revision).toBe(revision);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(submitGridUpload).toHaveBeenCalledTimes(4);
    } finally {
      restored.disposeUploadJobs();
      configureUploadFollowups(undefined);
      restored.useUploadJobsStore.setState({ batches: [] });
      vi.unstubAllGlobals();
    }
  });

  it.each([false, true])("publishes transfer progress but saves only new recovery facts (first ID save fails: %s)", async failIdSave => {
    const imageId = "d".repeat(40);
    const persist = vi.fn((_key: string, _value: string) => {});
    vi.stubGlobal("sessionStorage", { length: 0, setItem: persist });
    let finish!: () => void;
    const submission = new Promise<Awaited<ReturnType<typeof submitGridUpload>>>(resolve => {
      finish = () => resolve({ outcome: "accepted", stage: "queued", imageId, queued: "acknowledged" });
    });
    vi.mocked(submitGridUpload).mockReturnValue(submission);
    try {
      const batchId = submitUploadFiles([file("progress.jpg")])!;
      const progress = vi.mocked(submitGridUpload).mock.calls[0][1];
      const phase = () => useUploadJobsStore.getState().batches[0].attempts[0].phase;
      const record = () => JSON.parse(persist.mock.lastCall![1]).attempts[0];
      progress("preparation");
      expect(phase()).toBe("preparing");
      expect(persist).toHaveBeenCalledTimes(1);
      expect(record()).toMatchObject({ phase: "interrupted" });
      if (failIdSave) persist.mockImplementationOnce(() => { throw new Error("Storage unavailable"); });
      progress("preparation", imageId);
      if (failIdSave) expect(useLocalPersistenceStore.getState().batchIssues[batchId]).toBeTruthy();
      else expect(record()).toMatchObject({ phase: "interrupted", statusId: imageId });
      const writes = persist.mock.calls.length;
      progress("transfer", imageId);
      expect(persist).toHaveBeenCalledTimes(writes + Number(failIdSave));
      expect(phase()).toBe("transferring");
      expect(useLocalPersistenceStore.getState().batchIssues[batchId]).toBeUndefined();
      expect(record()).toMatchObject({ phase: "interrupted", statusId: imageId });
      persist.mockClear();
      progress("queued", imageId);
      expect(phase()).toBe("processing");
      expect(persist).not.toHaveBeenCalled();
      finish();
      await Promise.resolve();
      expect(record().submission).toMatchObject({ outcome: "accepted", queued: "acknowledged" });
    } finally { finish(); await submission; disposeUploadJobs(); vi.unstubAllGlobals(); }
  });

  it("keeps polling without publishing or saving unchanged progress", async () => {
    vi.useFakeTimers();
    const imageId = "c".repeat(40);
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "accepted", stage: "transfer", imageId });
    vi.mocked(observeGridUpload).mockResolvedValueOnce({ outcome: "status", status: "PROCESSING" })
      .mockResolvedValueOnce({ outcome: "status", status: "PROCESSING" })
      .mockResolvedValue({ outcome: "status", status: "COMPLETED" });
    vi.mocked(observeUploadedImage).mockResolvedValueOnce({ outcome: "missing" }).mockResolvedValue({ outcome: "visible" });
    let unavailable = true;
    const persist = vi.fn((_key: string, _value: string) => { if (unavailable) throw new Error("Storage unavailable"); });
    vi.stubGlobal("sessionStorage", { length: 0, setItem: persist });
    const published = vi.fn();
    const unsubscribe = useUploadJobsStore.subscribe(published);
    try {
      const batchId = submitUploadFiles([file("later.jpg")])!;
      await Promise.resolve();
      expect(useLocalPersistenceStore.getState().batchIssues[batchId]).toBeTruthy();
      unavailable = false;
      await vi.advanceTimersByTimeAsync(1);
      expect(useLocalPersistenceStore.getState().batchIssues[batchId]).toBeUndefined();
      expect(JSON.parse(persist.mock.lastCall![1]).attempts[0]).toMatchObject({ statusId: imageId });
      persist.mockClear();
      published.mockClear();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(observeGridUpload).toHaveBeenCalledTimes(2);
      expect(published).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(JSON.parse(persist.mock.lastCall![1]).attempts[0]).toMatchObject({ statusId: imageId, processingComplete: true });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(JSON.parse(persist.mock.lastCall![1]).attempts[0]).toMatchObject({ phase: "complete", imageId });
    } finally { unsubscribe(); vi.unstubAllGlobals(); }
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
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = "b".repeat(40);
    vi.mocked(submitGridUpload).mockResolvedValue({ outcome: "accepted", stage: "transfer", imageId: id });
    vi.mocked(observeGridUpload).mockResolvedValueOnce({ outcome: "missing" }).mockResolvedValueOnce({ outcome: "missing" }).mockResolvedValueOnce({ outcome: "status", status: "COMPLETED" });
    vi.mocked(observeUploadedImage).mockResolvedValueOnce({ outcome: "missing" }).mockResolvedValueOnce({ outcome: "missing" }).mockResolvedValue({ outcome: "visible" });
    submitUploadFiles([file("missing.jpg")]);
    await vi.advanceTimersByTimeAsync(1);
    const attempt = useUploadJobsStore.getState().batches[0].attempts[0];
    expect(attempt.phase).toBe("uncertain");
    expect(attempt.statusId).toBe(id);
    checkUploadAttempt(attempt.id);
    await vi.advanceTimersByTimeAsync(1);
    expect(useUploadJobsStore.getState().batches[0].attempts[0].phase).toBe("uncertain");
    expect(errors).toHaveBeenCalledOnce();
    checkUploadAttempt(attempt.id);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(useUploadJobsStore.getState().batches[0].attempts[0].phase).toBe("complete");
    expect(submitGridUpload).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(errors).toHaveBeenCalledOnce();
    errors.mockRestore();
  });
});