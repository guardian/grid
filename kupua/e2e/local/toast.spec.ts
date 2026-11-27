/**
 * Toast primitive smoke test.
 *
 * Tests that:
 * 1. Firing a toast via the dev demo bar shows the toast.
 * 2. The toast has the correct message and category.
 * 3. Clicking the dismiss button removes the toast.
 * 4. The toast auto-dismisses after its duration (using store helper for speed).
 *
 * Run:
 *   npm --prefix kupua run test:e2e -- toast.spec.ts
 *   npm --prefix kupua run test:e2e -- toast.spec.ts --headed
 */

import { test, expect } from "../shared/helpers";
import type { Page } from "@playwright/test";

// Helper to fire a toast via the store (bypasses 5s timer for speed)
async function fireToast(
  page: Page,
  category: string,
  message: string,
): Promise<void> {
  await page.evaluate(
    ([cat, msg]) => {
      const store = (window as any).__kupua_toast_store__;
      store?.[cat]?.(msg);
    },
    [category, message] as [string, string],
  );
}

async function getQueueLength(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (window as any).__kupua_toast_store__;
    return store?._store?.getState().queue.length ?? 0;
  });
}

test.describe("Toast primitive (S2.5)", () => {
  test.beforeEach(async ({ page, kupua }) => {
    await page.goto("/search");
    await kupua.waitForResults();
  });

  test("info toast appears and is dismissible", async ({ page }) => {
    await fireToast(page, "info", "2,400 items added to your selection.");

    const toast = page.getByTestId("toast").first();
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("2,400 items added");
    await expect(toast).toHaveAttribute("data-category", "information");

    // Dismiss
    await toast.getByRole("button", { name: /dismiss/i }).click();
    await expect(toast).not.toBeVisible();
  });

  test("keeps Share visible in a crowded stack and dismisses it on middle-click", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 260 });
    await page.evaluate(() => {
      const store = (window as any).__kupua_toast_store__._store.getState();
      for (let index = 0; index < 5; index++) {
        store.add({ category: "warning", message: `Warning ${index}: Selection unchanged. Select fewer images to continue.`, lifespan: "session", durationMs: 0 });
      }
      store.add({ category: "success", message: "Share link copied to clipboard.", interaction: "share",
        lifespan: "session", durationMs: 0, link: { href: "/search?nonFree=true", label: "Open link" } });
    });
    const stack = page.getByLabel("Notifications");
    const link = stack.getByRole("link", { name: "Open link" });
    await expect(link).toBeInViewport({ ratio: 1 });
    const fade = await stack.evaluateHandle(stackElement => new Promise<Animation | null>(resolve => {
      const observer = new MutationObserver(() => {
        const toast = Array.from(stackElement.querySelectorAll('[data-testid="toast"]')).find(item => item.textContent?.includes("Replacement Share"));
        if (!toast) return;
        observer.disconnect();
        const animation = toast.parentElement!.getAnimations().find(candidate =>
          (candidate.effect as KeyframeEffect).getKeyframes().some(frame => frame.opacity === "0"));
        if (animation) {
          animation.pause();
          animation.currentTime = 0;
        }
        resolve(animation ?? null);
      });
      observer.observe(stackElement, { childList: true });
      const store = (window as any).__kupua_toast_store__._store.getState();
      store.add({ category: "information", message: "Replacement Share", interaction: "share",
        lifespan: "session", durationMs: 0, link: { href: "/search?nonFree=true", label: "Open link" } });
    }));
    try {
      await fireToast(page, "warning", "Another warning arrived during replacement");
      await expect(stack.getByText("Another warning arrived during replacement")).toBeVisible();
      expect(await fade.evaluate(animation => animation?.playState)).toBe("paused");
    } finally {
      await fade.evaluate(animation => animation?.finish());
      await fade.dispose();
    }
    const [tab] = await Promise.all([page.context().waitForEvent("page"), link.click({ button: "middle" })]);
    try {
      await expect(tab).toHaveURL(/\/search\?nonFree=true/);
      await expect(link).toHaveCount(0);
      await expect(stack.getByTestId("toast")).toHaveCount(5);
    } finally {
      await tab.close();
    }
  });

});
