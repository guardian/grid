/**
 * @vitest-environment jsdom
 */

/**
 * Tickbox component tests.
 *
 * Covers:
 * - Renders nothing when disabled (skeleton cell guard).
 * - Renders a button when not disabled.
 * - Shows no checkmark when not selected.
 * - Shows a checkmark when selected.
 * - Calls onTickClick (with stopPropagation) on click.
 * - aria-checked reflects selection state.
 * - Label changes between selected/deselected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Tickbox, TableTickbox } from "./Tickbox";
import { useSelectionStore } from "@/stores/selection-store";
import {
  _resetMetadataCache,
  _resetDebounceState,
  _resetReconcileQueue,
} from "@/stores/selection-store";

function resetStore() {
  useSelectionStore.setState({
    selectedIds: new Set<string>(),
    anchorId: null,
    generationCounter: 0,
    reconciledView: null,
    pendingFetchIds: new Set<string>(),
  });
  _resetMetadataCache();
  _resetDebounceState();
  _resetReconcileQueue();
}

describe("Tickbox", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(
      <Tickbox imageId="img-1" disabled onTickClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a button when not disabled", () => {
    render(<Tickbox imageId="img-1" onTickClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDefined();
  });

  it("has aria-checked=false when image is not selected", () => {
    render(<Tickbox imageId="img-1" onTickClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-checked")).toBe("false");
  });

  it("has aria-checked=true when image is selected", () => {
    // Directly set state to avoid going through toggle (which triggers metadata fetch).
    useSelectionStore.setState({ selectedIds: new Set(["img-1"]) });
    render(<Tickbox imageId="img-1" onTickClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-checked")).toBe("true");
  });

  it("shows checkmark SVG when selected", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-1"]) });
    const { container } = render(<Tickbox imageId="img-1" onTickClick={vi.fn()} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("shows no checkmark SVG when not selected", () => {
    const { container } = render(<Tickbox imageId="img-1" onTickClick={vi.fn()} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeNull();
  });

  it("calls onTickClick when clicked", () => {
    const onTickClick = vi.fn();
    render(<Tickbox imageId="img-1" onTickClick={onTickClick} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onTickClick).toHaveBeenCalledOnce();
  });

  it("has 'Deselect image' label when selected", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-1"]) });
    render(<Tickbox imageId="img-1" onTickClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Deselect image");
  });

  it("has 'Select image' label when not selected", () => {
    render(<Tickbox imageId="img-1" onTickClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Select image");
  });
});

describe("TableTickbox", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(
      <TableTickbox imageId="img-1" disabled onTickClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("reflects selection state via aria-checked", () => {
    useSelectionStore.setState({ selectedIds: new Set(["img-1"]) });
    render(<TableTickbox imageId="img-1" onTickClick={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-checked")).toBe("true");
  });
});
