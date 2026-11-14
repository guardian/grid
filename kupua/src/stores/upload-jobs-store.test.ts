import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadBatchMembership } from "@/lib/browsing-context";
import { checkUploadAttempt, disposeUploadJobs, submitUploadFiles, useUploadJobsStore } from "./upload-jobs-store";
import { observeGridUpload, observeUploadedImage, submitGridUpload } from "@/lib/upload-commands";

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