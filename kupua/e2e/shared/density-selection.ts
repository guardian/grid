import type { Locator, Page } from "@playwright/test";

export type Density = "grid" | "table" | "justified";

export async function getDensityChangeButton(page: Page, density: Density): Promise<Locator | null> {
  const button = page.getByRole("button", { name: `${density[0].toUpperCase()}${density.slice(1)} view`, exact: true });
  return await button.getAttribute("aria-pressed") === "true" ? null : button;
}

export async function waitForDensityRow(page: Page, density: Density, imageId: string): Promise<void> {
  await page.waitForFunction(({ density, imageId }) => {
    const container = document.querySelector(`[aria-label="Image results ${density}"]`);
    const cell = container?.querySelector(`[data-image-id="${CSS.escape(imageId)}"]`);
    return Boolean(cell && cell.getBoundingClientRect().height > 0);
  }, { density, imageId });
}