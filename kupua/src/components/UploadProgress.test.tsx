/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react/pure";
import { UploadNotices, UploadProgress } from "./UploadProgress";
import { UploadDropzone, UploadEntry } from "./UploadActivity";
import { checkUploadAttempt, useUploadJobsStore, type UploadAttempt } from "@/stores/upload-jobs-store";
import { useLocalPersistenceStore } from "@/lib/local-batch-storage";
import { useToastStore } from "@/stores/toast-store";
import { getGridSessionPermissions } from "@/lib/grid-api-instance";

const router = vi.hoisted(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  return { navigate: vi.fn(), location: { pathname: "/search", search: {}, href: "/search" } };
});
const access = vi.hoisted(() => ({ enabled: true, canUpload: false }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => router.navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({ location: router.location }),
}));
vi.mock("@/lib/upload-commands", () => ({
  gridUploadsEnabled: () => access.enabled, submitGridUpload: vi.fn(), observeGridUpload: vi.fn(), observeUploadedImage: vi.fn(),
}));
vi.mock("@/lib/grid-api-instance", async original => ({
  ...await original<typeof import("@/lib/grid-api-instance")>(),
  getGridSessionPermissions: vi.fn(async () => ({ canUpload: access.canUpload })),
}));
vi.mock("@/lib/site-settings", async original => ({
  ...await original<typeof import("@/lib/site-settings")>(),
  siteSettings: () => ({ upload: { transport: "direct" } }),
}));
vi.mock("@/stores/upload-jobs-store", async original => ({
  ...await original<typeof import("@/stores/upload-jobs-store")>(), checkUploadAttempt: vi.fn(),
}));

beforeEach(() => {
  access.enabled = true; access.canUpload = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  useUploadJobsStore.setState({ batches: [], activityAttemptIds: new Set() });
  useLocalPersistenceStore.setState({ batchIssues: {}, descriptorIssue: null, historyIssue: null });
  useToastStore.getState()._clearAll();
  vi.restoreAllMocks(); vi.clearAllMocks();
});

function load(attempts: UploadAttempt[]) {
  useUploadJobsStore.setState({ batches: [{ id: "local-fixture", createdAt: 1, attempts }],
    activityAttemptIds: new Set(attempts.map(attempt => attempt.id)) });
}

it.each(["permission", "preference"])("hides upload entry and drop handling when %s refuses uploads", async reason => {
  access.enabled = reason !== "preference";
  access.canUpload = reason === "preference";
  const { container } = render(<UploadDropzone><span>Search content</span><UploadEntry /></UploadDropzone>);
  await act(async () => {});
  expect(screen.getByText("Search content")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Upload files" })).toBeNull();
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(container.querySelector("[data-upload-dropzone]")).toBeNull();
});

it("preserves the page input and focus when delayed upload permission resolves", async () => {
  let permit!: () => void;
  vi.mocked(getGridSessionPermissions).mockImplementationOnce(() => new Promise(resolve => {
    permit = () => resolve({ canUpload: true });
  }));
  render(<UploadDropzone><input aria-label="Search draft" /></UploadDropzone>);
  const input = screen.getByRole("textbox", { name: "Search draft" });
  fireEvent.change(input, { target: { value: "Uncommitted search" } });
  input.focus();
  await act(async () => permit());
  expect(screen.getByRole("textbox", { name: "Search draft" })).toBe(input);
  expect((input as HTMLInputElement).value).toBe("Uncommitted search");
  expect(document.activeElement).toBe(input);
});

it.each([false, true])("opens an activity image only while its list navigation remains current (superseded=%s)", async superseded => {
  const previousHistory = window.history.state;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  router.navigate.mockImplementationOnce(options => {
    window.history.replaceState(options.state, "");
    return pending;
  });
  load([{ id: "done", name: "done.jpg", size: 1, phase: "complete", imageId: "a".repeat(40) }]);
  render(<UploadProgress split />);
  try {
    fireEvent.click(screen.getByRole("button", { name: /^Upload activity:/ }));
    fireEvent.click(screen.getByRole("button", { name: "done.jpg" }));
    expect(router.navigate).toHaveBeenCalledTimes(1);
    if (superseded) window.history.replaceState({ kupuaKey: "newer-navigation" }, "");
    await act(async () => { release(); await pending; });
    expect(router.navigate).toHaveBeenCalledTimes(superseded ? 1 : 2);
    if (!superseded) expect(router.navigate.mock.calls[1][0].search.image).toBe("a".repeat(40));
  } finally {
    await act(async () => { release(); await pending; });
    window.history.replaceState(previousHistory, "");
  }
});

it("shows one priority status, orders errors before running and complete files, and dismisses only the chosen error", () => {
  load([
    { id: "done", name: "done.jpg", size: 1, phase: "complete", imageId: "a".repeat(40) },
    { id: "running", name: "running.jpg", size: 1, phase: "processing" },
    { id: "unknown", name: "unknown.jpg", size: 1, phase: "uncertain", statusId: "b".repeat(40) },
  ]);
  useUploadJobsStore.setState(state => ({
    batches: [...state.batches, { id: "local-older", createdAt: 0,
      attempts: [{ id: "older-error", name: "older.jpg", size: 1, phase: "failed" as const }] }],
    activityAttemptIds: new Set([...state.activityAttemptIds, "older-error"]),
  }));
  render(<UploadProgress split />);
  fireEvent.click(screen.getByRole("button", { name: "Upload activity: 2 need attention" }));
  const panel = screen.getByRole("region", { name: "Upload activity" });
  expect([...panel.querySelectorAll("[data-upload-attempt]")].map(element => element.getAttribute("data-upload-attempt")))
    .toEqual(["unknown", "older-error", "running", "done"]);
  expect(screen.queryByText("Image available")).toBeNull();
  expect(screen.queryByText("Processing")).toBeNull();
  fireEvent.click(within(panel).getByRole("button", { name: "Recheck" }));
  expect(checkUploadAttempt).toHaveBeenCalledWith("unknown");
  fireEvent.click(within(panel).getByRole("button", { name: "Acknowledge error for older.jpg" }));
  expect(screen.getByRole("button", { name: "Upload activity: 1 need attention" })).toBeTruthy();
  expect(useUploadJobsStore.getState().batches[1].attempts[0].notificationDismissed).toBe(true);
  fireEvent.click(within(panel).getByRole("button", { name: "Acknowledge error for unknown.jpg" }));
  expect(screen.getByRole("button", { name: "Upload activity: 1 in progress" })).toBeTruthy();
  expect(useUploadJobsStore.getState().batches[0].attempts.find(attempt => attempt.id === "unknown")?.notificationDismissed).toBe(true);
  expect(screen.queryByRole("button", { name: /Dismiss all/i })).toBeNull();
});

it("uses approved copy, keeps uncheckable outcomes honest and expands redacted server details", () => {
  const target = new URL("https://example.test/storage"); target.searchParams.set("X-Amz-Signature", "synthetic");
  load([
    { id: "corrupt", name: "broken.jpg", size: 1, phase: "failed", statusId: "c".repeat(40), serverError: `com.drew.imaging.ImageProcessingException: Invalid image ${target.href}` },
    { id: "server", name: "server.jpg", size: 1, phase: "blocked", message: "Upload permission is unavailable." },
    { id: "large", name: "large.tif", size: 742_000_000, phase: "failed", submission: { outcome: "failed", stage: "preparation", failureKind: "size", maxFileBytes: 666_000_000 } },
    { id: "no-id", name: "unknown.jpg", size: 1, phase: "uncertain" },
  ]);
  render(<UploadProgress split />);
  fireEvent.click(screen.getByRole("button", { name: "Upload activity: 4 need attention" }));
  expect(screen.getByText("Server error")).toBeTruthy();
  expect(screen.queryByText("Upload permission is unavailable.")).toBeNull();
  expect(screen.getByText("Filesize exceeds max 666MB")).toBeTruthy();
  expect(screen.getByText("Not confirmed")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Recheck" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Image corrupted" }));
  const detail = screen.getByRole("region", { name: "Upload error for broken.jpg" });
  expect(detail.textContent).toContain("ImageProcessingException");
  expect(detail.textContent).not.toContain("X-Amz-Signature");
  expect(within(detail).getByRole("button", { name: "Copy error" })).toBeTruthy();
  const resultsKey = vi.fn();
  document.addEventListener("keydown", resultsKey);
  try {
    const event = new KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true });
    fireEvent(detail.querySelector("pre")!, event);
    expect(resultsKey).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  } finally { document.removeEventListener("keydown", resultsKey); }
});

it("uses warning toasts only for upload-history failures, logs history-only problems and suppresses identical reports", () => {
  useLocalPersistenceStore.setState({ batchIssues: { "local-fixture": "Synthetic descriptor failure" }, descriptorIssue: "Synthetic unavailable record", historyIssue: "Synthetic history failure" });
  render(<UploadNotices />);
  expect(useToastStore.getState().queue.map(toast => [toast.category, toast.message])).toEqual([
    ["warning", "Requested upload history unavailable"], ["warning", "Upload history saving error"],
  ]);
  expect(console.error).toHaveBeenCalledTimes(3);
  act(() => useLocalPersistenceStore.setState({ batchIssues: { "local-fixture": "Synthetic descriptor failure" } }));
  expect(console.error).toHaveBeenCalledTimes(3);
  expect(useToastStore.getState().queue).toHaveLength(2);
});