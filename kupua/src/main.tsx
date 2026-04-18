import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { markUserInitiatedNavigation } from "./lib/orchestration/search";
import "./index.css";

// Expose router and navigation flag for E2E tests — lets Playwright
// navigate via router.navigate() (simulating user-initiated navigation)
// instead of raw pushState+popstate.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_router__ = router;
  (window as unknown as Record<string, unknown>).__kupua_markUserNav__ = markUserInitiatedNavigation;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

