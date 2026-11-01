/**
 * Root route — provides the app shell layout.
 *
 * The toolbar (logo + search + filters + sort) lives inside each page route
 * because search controls depend on route-specific search params.  The root
 * just provides the outer container.
 */

import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ToastContainer";
import { applyLegacyCropParams } from "@/lib/crop/crop-options";

export const rootRoute = createRootRoute({
  beforeLoad: ({ location }) => {
    applyLegacyCropParams(new URLSearchParams(location.searchStr));
  },
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="h-dvh w-screen overflow-clip flex flex-col bg-grid-bg text-grid-text overscroll-y-none">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <ToastContainer />
    </div>
  );
}

