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
import { EditLifecycle } from "@/components/LabelEditor";
import { useAppCutout, useIsCompact } from "@/hooks/useShell";
import { applyLegacyCropParams } from "@/lib/crop/crop-options";
import { UploadActivity, UploadDropzone, UploadNotices } from "@/components/UploadActivity";

export const rootRoute = createRootRoute({
  beforeLoad: ({ location }) => {
    applyLegacyCropParams(new URLSearchParams(location.searchStr));
  },
  component: RootLayout,
});

function RootLayout() {
  const compact = useIsCompact();
  useAppCutout(compact);
  return (
    <UploadDropzone><div className="h-dvh w-screen overflow-clip flex flex-col bg-grid-bg text-grid-text overscroll-y-none">
      <UploadActivity />
      <UploadNotices />
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <ToastContainer />
      <EditLifecycle />
    </div></UploadDropzone>
  );
}

