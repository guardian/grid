/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { format, parseISO } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string | undefined>,
  updateSearch: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => mocks.params,
}));

vi.mock("@/hooks/useUrlSearchSync", () => ({
  useUpdateSearchParams: () => mocks.updateSearch,
}));

import { DateFilter } from "./DateFilter";

describe("DateFilter", () => {
  beforeEach(() => {
    mocks.params = { nonFree: "true" };
    mocks.updateSearch.mockReset();
  });

  afterEach(cleanup);

  it("presents a malformed URL bound like Kahuna", () => {
    mocks.params = { nonFree: "true", since: "not-a-date" };
    render(<DateFilter />);

    const invalidLabel = screen.getByText("Uploaded: from Invalid date");
    expect(invalidLabel.className).toContain("text-red");
    expect(
      screen
        .getByRole("button", { name: "Show date range filter" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it.each([
    [{ until: "not-a-date" }, "Uploaded: until Invalid date"],
    [{ dateField: "taken", takenSince: "not-a-date" }, "Taken: from Invalid date"],
    [{ dateField: "modified", modifiedUntil: "not-a-date" }, "Modified: until Invalid date"],
  ])("presents other malformed active bounds", (params, label) => {
    mocks.params = { nonFree: "true", ...params };
    const { container } = render(<DateFilter />);

    expect(screen.getByText(label).className).toContain("text-red");
    fireEvent.click(screen.getByRole("button", { name: "Show date range filter" }));

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(Array.from(dateInputs, (input) => input.value)).toEqual(["", ""]);
  });

  it("keeps a malformed URL bound recoverable when the dropdown opens", () => {
    mocks.params = { nonFree: "true", since: "not-a-date" };
    const { container } = render(<DateFilter />);

    fireEvent.click(screen.getByRole("button", { name: "Show date range filter" }));

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    expect(dateInputs[0].value).toBe("");
    expect(mocks.updateSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));

    expect(mocks.updateSearch).toHaveBeenCalledWith(expect.objectContaining({
      since: undefined,
    }));
  });

  it("preserves valid local-calendar input values", () => {
    const since = "2026-03-20T00:00:00.000Z";
    const until = "2026-03-22T23:59:59.999Z";
    mocks.params = { nonFree: "true", since, until };
    const { container } = render(<DateFilter />);

    fireEvent.click(screen.getByRole("button", { name: "Show date range filter" }));

    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs[0].value).toBe(format(parseISO(since), "yyyy-MM-dd"));
    expect(dateInputs[1].value).toBe(format(parseISO(until), "yyyy-MM-dd"));
  });
});