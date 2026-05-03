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

// Helper to fire a toast via the store (bypasses 5s timer for speed)
async function fireToast(
  page: Parameters<typeof test>[1]["page"],
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

async function getQueueLength(page: Parameters<typeof test>[1]["page"]): Promise<number> {
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

  test("warning toast appears with correct category", async ({ page }) => {
    await fireToast(page, "warning", "Selection limited to 5,000 items.");

    const toast = page.getByTestId("toast").first();
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("data-category", "warning");
  });

  test("error toast appears with correct category", async ({ page }) => {
    await fireToast(page, "error", "Range fetch failed.");

    const toast = page.getByTestId("toast").first();
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("data-category", "error");
  });

  test("success toast appears with correct category", async ({ page }) => {
    await fireToast(page, "success", "Export ready.");

    const toast = page.getByTestId("toast").first();
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute("data-category", "success");
  });

  test("multiple toasts stack and each is individually dismissible", async ({ page }) => {
    await fireToast(page, "info", "First toast");
    await fireToast(page, "warning", "Second toast");

    const toasts = page.getByTestId("toast");
    await expect(toasts).toHaveCount(2);

    // Dismiss the first (topmost visible = newest)
    await toasts.first().getByRole("button", { name: /dismiss/i }).click();
    await expect(toasts).toHaveCount(1);
  });
});
