/**
 * Image route — single-image detail view at `/images/:imageId`.
 *
 * The route component does NOT unmount when imageId changes — TanStack Router
 * reconciles the same component with new params. This is critical: the
 * fullscreened DOM element persists across image navigations, so fullscreen
 * mode survives prev/next flicking.
 */

import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import { ImageDetail } from "@/components/ImageDetail";

export const imageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/images/$imageId",
  component: ImageDetail,
});

