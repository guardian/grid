// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { isCqlChipDeleteEvent } from "./cql-chip-delete";

describe("isCqlChipDeleteEvent", () => {
  it("recognizes only events whose composed path contains a chip delete handle", () => {
    const deleteHandle = document.createElement("span");
    deleteHandle.className = "Cql__ChipWrapperDeleteHandle";
    const chip = document.createElement("span");

    expect(isCqlChipDeleteEvent({ composedPath: () => [deleteHandle, chip] })).toBe(true);
    expect(isCqlChipDeleteEvent({ composedPath: () => [chip] })).toBe(false);
  });
});