/**
 * Root route — provides the app shell layout.
 *
 * The toolbar (logo + search + filters + sort) lives inside each page route
 * because search controls depend on route-specific search params.  The root
 * just provides the outer container.
 */

import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const rootRoute = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-grid-bg text-grid-text">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}

