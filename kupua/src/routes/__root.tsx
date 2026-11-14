/**
 * Root route — provides the app shell layout.
 *
 * The toolbar (logo + search + filters + sort) lives inside each page route
 * because search controls depend on route-specific search params.  The root
 * just provides the outer container.
 */

import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/ToastContainer";
import { LabelOperationReceipts } from "@/components/LabelEditor";
import { useAppCutout, useIsCompact } from "@/hooks/useShell";
import { useSelectionStore } from "@/stores/selection-store";
import { usePanelStore } from "@/stores/panel-store";
import { applyLegacyCropParams } from "@/lib/crop/crop-options";

export const rootRoute = createRootRoute({
  beforeLoad: ({ location }) => {
    applyLegacyCropParams(new URLSearchParams(location.searchStr));
  },
  component: RootLayout,
});

function RootLayout() {
  const compact = useIsCompact();
  const selected = useSelectionStore(state => state.selectedIds.size > 0);
  const expanded = usePanelStore(state => state.config.right.visible);
  const inlineActivity = useRouterState({ select: state => state.location.pathname === "/search"
    && !(state.location.search as { image?: string }).image });
  useAppCutout(compact);
  return (
    <div className="h-dvh w-screen overflow-clip flex flex-col bg-grid-bg text-grid-text overscroll-y-none">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      <ToastContainer />
      <LabelOperationReceipts hidden={compact && selected && expanded && inlineActivity} />
    </div>
  );
}

