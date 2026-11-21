// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("matchMedia", vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})));

const { ValueLink, FieldValue } = await import("./metadata-primitives");
const { FIELD_REGISTRY } = await import("@/lib/field-registry");
const { MockDataSource } = await import("@/dal/mock-data-source");

afterEach(cleanup);

describe("Location punctuation", () => {
  it("groups trailing commas with values, outside links, with breakable spaces between groups", async () => {
    const [image] = await new MockDataSource(1).getByIds(["img-0"]);
    const { container } = render(<FieldValue
      field={FIELD_REGISTRY.find(field => field.id === "location")!}
      image={{ ...image, metadata: { ...image.metadata, subLocation: "Venue", city: "City", state: undefined, country: "Country" } }}
      onSearch={vi.fn()}
    />);
    expect(container.textContent).toBe("Venue, City, Country");
    const groups = container.querySelectorAll(".inline-flex");
    expect(Array.from(groups, group => group.textContent)).toEqual(["Venue,", "City,", "Country"]);
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Venue", "City", "Country"]);
    expect(groups[0].nextSibling?.textContent).toBe(" ");
  });
});

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