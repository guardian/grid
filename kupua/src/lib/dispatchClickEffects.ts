/**
 * dispatchClickEffects -- translate ClickEffect[] into store mutations
 * and navigation actions.
 *
 * This is the single place that knows how to execute the declarative
 * effects produced by interpretClick(). Both ImageGrid and ImageTable use
 * it so the dispatch logic is never duplicated.
 *
 * Architecture: kupua/exploration/docs/00 Architecture and philosophy/05-selections.md §5
 */

import type { ClickEffect } from "./interpretClick";
import { useSelectionStore } from "@/stores/selection-store";
import { getEffectiveFocusMode } from "@/stores/ui-prefs-store";

/** The `add-range` effect shape, extracted for use by useRangeSelection. */
export type AddRangeEffect = Extract<ClickEffect, { op: "add-range" }>;

export interface EffectDispatchContext {
  /** Called for `set-focus` effects (and implicitly inside `enterDetail`). */
  setFocusedImageId: (id: string | null) => void;
  /**
   * Called for `open-detail` effects.
   * In phantom mode, single-click fires open-detail -- enterDetail navigates.
   * In explicit mode, open-detail from a single click is a no-op here
   * (double-click handles navigation separately).
   */
  enterDetail: (id: string) => void;
  /**
   * Called for `add-range` effects. Supplied by `useRangeSelection` mounted
   * in `search.tsx`. Optional -- if absent, `add-range` is silently ignored.
   */
  handleRange?: (effect: AddRangeEffect) => void;
}

export function dispatchClickEffects(
  effects: ClickEffect[],
  ctx: EffectDispatchContext,
): void {
  for (const effect of effects) {
    switch (effect.op) {
      case "set-focus":
        ctx.setFocusedImageId(effect.id);
        break;

      case "open-detail":
        // Phantom mode: single-click navigates to detail.
        // Explicit mode: single-click only sets focus; double-click navigates.
        if (getEffectiveFocusMode() === "phantom") {
          ctx.enterDetail(effect.id);
        }
        break;

      case "toggle":
        useSelectionStore.getState().toggle(effect.id);
        break;

      case "set-anchor":
        useSelectionStore.getState().setAnchor(effect.id);
        break;

      case "add-range":
        // Handled by useRangeSelection (mounted in search.tsx).
        // If not wired (e.g. in tests without route context), silently ignore.
        ctx.handleRange?.(effect);
        break;

      default:
        // Exhaustive check -- TypeScript will error if a new effect op is added
        // to interpretClick without being handled here.
        effect satisfies never;
    }
  }
}
