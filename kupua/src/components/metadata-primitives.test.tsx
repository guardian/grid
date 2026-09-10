// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("matchMedia", vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})));

const { ValueLink } = await import("./metadata-primitives");

afterEach(cleanup);

describe("ValueLink", () => {
  it("exposes its exact search field and value", () => {
    render(
      <ValueLink
        cqlKey="colourModel"
        value="RGB"
        onSearch={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "RGB" });
    expect(button.getAttribute("data-cql-key")).toBe("colourModel");
    expect(button.getAttribute("data-cql-value")).toBe("RGB");
  });
});