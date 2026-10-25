// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIELDS_BY_ID } from "@/lib/field-registry";
import type { EnrichedImage } from "@/lib/derive-enriched-image";
import type { Image } from "@/types/image";
import { TableRowCells } from "./TableRowCells";

vi.mock("@/lib/image-urls", () => ({ getThumbnailUrl: () => "/fixture-thumbnail.jpg" }));

const image: Image = {
  id: "fixture-row", uploadedBy: "fixture", uploadTime: "2026-01-10T12:30:00Z",
  source: { mimeType: "image/jpeg", dimensions: { width: 1000, height: 500 } },
  metadata: { title: "Original", description: "Description", byline: "Byline", city: "City", country: "Country",
    subjects: ["First", "Second"] },
};
const columns = (ids: string[]) => ids.map(id => ({ id, header: id }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("TableRowCells", () => {
  it("does not repeat field work when its stable inputs are unchanged", () => {
    const accessor = vi.spyOn(FIELDS_BY_ID.get("metadata_title")!, "accessor");
    const props = { image, columns: columns(["metadata_title"]), enriched: undefined, handleCellClick: vi.fn() };
    const view = render(<TableRowCells {...props} />);
    expect(accessor).toHaveBeenCalledTimes(1);
    accessor.mockClear();
    for (let index = 0; index < 10; index++) view.rerender(<TableRowCells {...props} />);
    expect(accessor).not.toHaveBeenCalled();
  });

  it("updates replaced image metadata even when the identity stays the same", () => {
    const props = { image, columns: columns(["metadata_title"]), enriched: undefined, handleCellClick: vi.fn() };
    const view = render(<TableRowCells {...props} />);
    view.rerender(<TableRowCells {...props} image={{ ...image, metadata: { ...image.metadata, title: "Updated" } }} />);
    expect(view.getByRole("gridcell").textContent).toBe("Updated");
    expect(view.getByRole("gridcell").title).toBe("Updated");
  });

  it("updates column replacements even when their count is unchanged", () => {
    const props = { image, columns: columns(["metadata_title"]), enriched: undefined, handleCellClick: vi.fn() };
    const view = render(<TableRowCells {...props} />);
    view.rerender(<TableRowCells {...props} columns={columns(["metadata_description"])} />);
    expect(view.getByRole("gridcell").textContent).toBe("Description");
  });

  it("updates enriched content independently of raw image identity", () => {
    vi.spyOn(FIELDS_BY_ID.get("badges")!, "cellRenderer").mockImplementation(enriched => enriched.metadata.title);
    const props = { image, columns: columns(["badges"]), enriched: { ...image } as EnrichedImage, handleCellClick: vi.fn() };
    const view = render(<TableRowCells {...props} />);
    view.rerender(<TableRowCells {...props} enriched={{ ...image, metadata: { ...image.metadata, title: "Enriched" } } as EnrichedImage} />);
    expect(view.getByRole("gridcell").textContent).toBe("Enriched");
  });

  it("formats dimensions once for both display and tooltip", () => {
    const field = FIELDS_BY_ID.get("dimensions")!;
    const expected = field.accessor(image);
    const accessor = vi.spyOn(field, "accessor");
    const view = render(<TableRowCells image={image} columns={columns(["dimensions"])} enriched={undefined} handleCellClick={vi.fn()} />);
    expect(view.getByRole("gridcell").textContent).toBe(expected);
    expect(view.getByRole("gridcell").title).toBe(expected);
    expect(accessor).toHaveBeenCalledTimes(1);
  });

  it("preserves formatted dates and raw date tooltips", () => {
    const view = render(<TableRowCells image={image} columns={columns(["uploadTime"])} enriched={undefined} handleCellClick={vi.fn()} />);
    expect(view.getByRole("gridcell").textContent).toBe(FIELDS_BY_ID.get("uploadTime")!.formatter!(image.uploadTime));
    expect(view.getByRole("gridcell").title).toBe(image.uploadTime);
  });

  it("preserves list and location search attributes and modifier clicks", () => {
    const click = vi.fn();
    const view = render(<TableRowCells image={image} columns={columns(["subjects", "location"])} enriched={undefined} handleCellClick={click} />);
    const subject = view.getByText("First");
    expect(subject.getAttribute("data-cql-value")).toBe("First");
    expect(view.getByText("City").getAttribute("data-cql-key")).toBe("city");
    fireEvent.click(subject, { shiftKey: true });
    expect(click.mock.calls[0][0]).toBe("subjects");
    expect(click.mock.calls[0][1]).toBe(image);
    expect(click.mock.calls[0][2].shiftKey).toBe(true);
    expect(fireEvent.mouseDown(subject, { altKey: true, cancelable: true })).toBe(false);
  });

  it("keeps empty field output and unavailable raw tooltips", () => {
    const view = render(<TableRowCells image={{ ...image, metadata: {} }} columns={columns(["metadata_title", "subjects", "location"])}
      enriched={undefined} handleCellClick={vi.fn()} />);
    for (const cell of view.getAllByRole("gridcell")) {
      expect(cell.textContent).toBe("\u2014");
      expect(cell.hasAttribute("title")).toBe(false);
    }
  });

  it("retains native lazy thumbnail behavior and hides failed images", () => {
    const view = render(<TableRowCells image={image} columns={columns(["thumbnail"])} enriched={undefined} handleCellClick={vi.fn()} />);
    const thumbnail = view.container.querySelector("img")!;
    expect(thumbnail.getAttribute("loading")).toBe("lazy");
    expect(thumbnail.getAttribute("src")).toBe("/fixture-thumbnail.jpg");
    fireEvent.error(thumbnail);
    expect(thumbnail.style.display).toBe("none");
  });
});