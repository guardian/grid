/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// A component that throws during render — used to trigger the boundary.
// The return type annotation satisfies TS (the throw means it never actually returns).
function ThrowingChild({ message }: { message: string }): React.JSX.Element {
  throw new Error(message);
}

// A component that renders normally.
function GoodChild() {
  return <div>All good</div>;
}

describe("ErrorBoundary", () => {
  // Suppress React's noisy error boundary console output during tests
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    cleanup();
    console.error = originalError;
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeDefined();
  });

  it("catches render errors and shows recovery UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild message="kaboom" />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("kaboom")).toBeDefined();
    expect(screen.getByText("Try again")).toBeDefined();
  });
});
