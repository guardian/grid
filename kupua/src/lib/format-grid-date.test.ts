import { afterEach, describe, expect, it, vi } from "vitest";
import { formatGridDate, getGridDatePresentation } from "./format-grid-date";
import type { Image } from "@/types/image";

afterEach(() => vi.restoreAllMocks());

describe("formatGridDate", () => {
  it.each([
    undefined,
    "",
    "not-a-date",
    "2026-01-01T00:00:00.000Z",
    "2026-06-15T23:59:00.000Z",
    "2026-03-29T01:30:00.000Z",
    "2026-10-25T01:30:00.000Z",
    "2026-06-15T10:15:00+05:30",
  ])("preserves the existing local date and time output for %s", (iso) => {
    const date = new Date(iso ?? "");
    const expected = iso
      ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        + ", " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : "[none]";
    expect(formatGridDate(iso)).toBe(expected);
  });

  it("reuses two Intl formatters instead of native locale formatting per call", async () => {
    vi.resetModules();
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    const dateMethod = vi.spyOn(Date.prototype, "toLocaleDateString");
    const timeMethod = vi.spyOn(Date.prototype, "toLocaleTimeString");
    const { formatGridDate: formatRepeatedly } = await import("./format-grid-date");

    for (let index = 0; index < 20; index++) {
      formatRepeatedly(`2026-06-${String(index + 1).padStart(2, "0")}T10:15:00.000Z`);
    }

    expect(dateMethod).not.toHaveBeenCalled();
    expect(timeMethod).not.toHaveBeenCalled();
    expect(constructor).toHaveBeenCalledTimes(2);
  });
});

describe("getGridDatePresentation", () => {
  const image = {
    id: "date-fixture", uploadedBy: "fixture", uploadTime: "2026-01-10T12:30:00Z",
    lastModified: "2026-01-12T14:00:00Z", metadata: { dateTaken: "2025-12-20T09:15:00Z" },
    source: { mimeType: "image/jpeg", dimensions: { width: 100, height: 100 } },
    collections: [{ pathId: "later", actionData: { date: "2026-01-09T10:00:00Z" } },
      { pathId: "earlier", actionData: { date: "2026-01-08T10:00:00Z" } }],
    usages: [{ platform: "print", dateAdded: "2026-01-07T10:00:00Z" },
      { platform: "digital", dateAdded: "2026-01-06T10:00:00Z" }],
  } as Image;

  it.each([
    [undefined, "Uploaded", image.uploadTime],
    ["-uploadTime", "Uploaded", image.uploadTime],
    ["metadata_credit", "Uploaded", image.uploadTime],
    ["taken,-uploadTime", "Taken", image.metadata.dateTaken],
    ["-lastModified", "Modified", image.lastModified],
    ["-dateAddedToCollection", "Added", "2026-01-09T10:00:00Z"],
    ["usagesDateAdded", "Used", "2026-01-07T10:00:00Z"],
  ])("preserves the caption and tooltip for sort %s", (orderBy, label, date) => {
    const presentation = getGridDatePresentation(image, orderBy);
    expect(presentation.dateLine).toBe(`${label}: ${formatGridDate(date)}`);
    expect(presentation.dateTooltip).toBe(`Uploaded: ${formatGridDate(image.uploadTime)}\n      Taken: ${formatGridDate(image.metadata.dateTaken)}\n  Modified: ${formatGridDate(image.lastModified)}`);
  });

  it("preserves absent collection and usage dates", () => {
    const sparse = { ...image, collections: [], usages: [] };
    expect(getGridDatePresentation(sparse, "dateAddedToCollection").dateLine).toBe("Added: [none]");
    expect(getGridDatePresentation(sparse, "usagesDateAdded").dateLine).toBe("Used: [none]");
  });
});