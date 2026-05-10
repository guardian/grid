import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { markUserInitiatedNavigation, markPushSnapshot } from "./lib/orchestration/search";
import { synthesiseKupuaKeyIfAbsent, getCurrentKupuaKey } from "./lib/orchestration/history-key";
import { snapshotStore, PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD } from "./lib/history-snapshot";
import { buildHistorySnapshot } from "./lib/build-history-snapshot";
import { fetchQuotas } from "./lib/cost/quota-store";
import "./index.css";

// Populate quota map once at startup. Fire-and-forget — if the API is
// unavailable (dev without tunnel, 401) the map stays empty and images stay
// "free". See kupua/src/lib/cost/quota-store.ts.
fetchQuotas();

// Disable browser's automatic scroll restoration — we manage scroll
// position ourselves via snapshot-based restoration on popstate.
// Without this, the browser's default 'auto' mode fights our restore
// by re-applying a saved scroll position one frame after we've seeked.
history.scrollRestoration = "manual";

// Ensure the current history entry has a kupuaKey before any router
// setup or navigation. On reload, the browser preserves history.state
// per entry, so an existing key from the pre-reload session survives.
// On fresh cold loads, we mint one here.
synthesiseKupuaKeyIfAbsent();

// Capture a snapshot for the current entry on pagehide (covers both
// reload and bfcache eviction). Without this, only *predecessor* entries
// have snapshots (captured on push). After reload, the mount-time
// restore path looks up the current entry's kupuaKey — this ensures
// there's something to find.
if (PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD) {
  window.addEventListener("pagehide", () => {
    const kupuaKey = getCurrentKupuaKey();
    if (kupuaKey) {
      snapshotStore.set(kupuaKey, buildHistorySnapshot());
    }
  });
}

// Expose router and navigation flag for E2E tests — lets Playwright
// navigate via router.navigate() (simulating user-initiated navigation)
// instead of raw pushState+popstate.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_router__ = router;
  (window as unknown as Record<string, unknown>).__kupua_markUserNav__ = markUserInitiatedNavigation;
  (window as unknown as Record<string, unknown>).__kupua_markPushSnapshot__ = markPushSnapshot;
  (window as unknown as Record<string, unknown>).__kupua_getKupuaKey__ = getCurrentKupuaKey;
  (window as unknown as Record<string, unknown>).__kupua_inspectSnapshot__ = (key: string) => snapshotStore.get(key);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

