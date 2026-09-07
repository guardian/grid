/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBedrockAvailable } from "@/lib/grid-config";
import { AiSearchInput } from "./AiSearchInput";

describe("AiSearchInput", () => {
  beforeEach(() => setBedrockAvailable(true));
  afterEach(() => {
    cleanup();
    setBedrockAvailable(false);
  });

  it("disables activation while a collection filter is active", () => {
    const onAiTextChange = vi.fn();
    render(
      <AiSearchInput
        aiText={null}
        onAiTextChange={onAiTextChange}
        // @ts-expect-error Failing-first: collectionDisabled is not implemented yet.
        collectionDisabled
      />,
    );

    const control = screen.getByRole("button", {
      name: "AI image search unavailable while filtering by collection",
    });
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(control.getAttribute("title")).toBe(
      "AI search is unavailable while filtering by collection",
    );

    fireEvent.click(control);
    expect(screen.getByRole("searchbox").getAttribute("tabindex")).toBe("-1");
    expect(onAiTextChange).not.toHaveBeenCalled();
  });

  it("collapses and disables an already-expanded empty input", () => {
    const onAiTextChange = vi.fn();
    const { rerender } = render(
      <AiSearchInput aiText={null} onAiTextChange={onAiTextChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable AI image search" }));
    expect(screen.getByRole("searchbox").getAttribute("tabindex")).toBe("0");

    rerender(
      <AiSearchInput
        aiText={null}
        onAiTextChange={onAiTextChange}
        collectionDisabled
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "AI image search unavailable while filtering by collection",
      }).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(screen.getByRole("searchbox").getAttribute("tabindex")).toBe("-1");
    expect(onAiTextChange).not.toHaveBeenCalled();
  });
});