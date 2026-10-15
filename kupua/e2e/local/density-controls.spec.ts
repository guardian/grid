import { test, expect } from "../shared/helpers";

test("independent density icons select views, toggle back to grid and keep grid idempotent", async ({ kupua, page }) => {
  await kupua.startSearch();
  const controls = page.getByRole("group", { name: "Image layout" });
  await expect(controls.getByRole("button")).toHaveCount(3);
  expect(await controls.getByRole("button").evaluateAll(buttons => buttons.every(button => button.getAttribute("type") === "button"))).toBe(true);
  expect(await controls.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label"))))
    .toEqual(["Table view", "Grid view", "Justified view"]);
  await expect(page.getByRole("note")).toHaveCount(0);
  const painted = await controls.locator("svg").evaluateAll(icons => icons.map(icon => {
    const svg = icon as SVGSVGElement;
    const box = svg.getBBox();
    const matrix = svg.getScreenCTM()!;
    return { width: box.width * Math.hypot(matrix.a, matrix.b), height: box.height * Math.hypot(matrix.c, matrix.d) };
  }));
  for (const icon of painted) {
    expect(Math.abs(icon.width - 14)).toBeLessThan(0.02);
    expect(Math.abs(icon.height - painted[1].height)).toBeLessThan(0.02);
  }
  const before = await page.evaluate(async () => {
    const path = "/src/stores/ui-prefs-store.ts";
    return (await import(path)).useUiPrefsStore.getState()._densityIntent;
  });
  await controls.getByRole("button", { name: "Grid view", exact: true }).click();
  expect(await page.evaluate(async () => {
    const path = "/src/stores/ui-prefs-store.ts";
    return (await import(path)).useUiPrefsStore.getState()._densityIntent;
  })).toBe(before);
  for (const name of ["Table", "Justified"]) {
    const button = controls.getByRole("button", { name: `${name} view`, exact: true });
    await button.click();
    await expect(page.getByRole("region", { name: `Image results ${name.toLowerCase()}`, exact: true })).toBeVisible();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.click();
    await expect(page.getByRole("region", { name: "Image results grid", exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Grid view", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await controls.getByRole("button", { name: "Justified view", exact: true }).click();
  await controls.getByRole("button", { name: "Table view", exact: true }).click();
  await controls.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(page.getByRole("region", { name: "Image results grid", exact: true })).toBeVisible();
});

for (const width of [320, 393]) {
  test(`native toolbar tabbing never shifts the app shell at ${width}px, with and without selection`, async ({ kupua, page }) => {
    await page.setViewportSize({ width, height: 852 });
    await kupua.startSearch();
    for (const selected of [false, true]) {
      if (selected) {
        const point = await kupua.waitForHitTestedImagePoint({ view: "grid" });
        const cell = page.locator(`[data-image-id="${point.imageId}"]`);
        await cell.hover();
        await cell.getByRole("button", { name: "Select image", exact: true }).click();
      }
      await page.getByRole("button", { name: "Show Browse panel", exact: true }).focus();
      const reached: string[] = [];
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press("Tab");
        const observation = await page.evaluate(() => {
          const shell = document.querySelector(".h-dvh.w-screen")!;
          const results = document.querySelector('[aria-label="Image results grid"]')!;
          const active = document.activeElement as HTMLElement;
          const rect = active.getBoundingClientRect();
          const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
          const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
          return { shellScroll: shell.scrollLeft, resultsLeft: results.getBoundingClientRect().left,
            rootScroll: scrollX, label: active.getAttribute("aria-label"),
            hit: active.contains(hit), right: rect.right, left: rect.left };
        });
        expect(observation.shellScroll).toBe(0);
        expect(observation.rootScroll).toBe(0);
        expect(observation.resultsLeft).toBe(0);
        if (observation.label?.endsWith(" view") || observation.label === "Clear selection") reached.push(observation.label);
        if (observation.label?.endsWith(" view") || observation.label === "Clear selection" || observation.label === "Show Details panel") {
          expect(observation.left).toBeGreaterThanOrEqual(0);
          expect(observation.right).toBeLessThanOrEqual(width);
          expect(observation.hit).toBe(true);
        }
        if (observation.label === "Show Details panel") break;
      }
      expect(reached).toEqual([...(selected ? ["Clear selection"] : []), "Table view", "Grid view", "Justified view"]);
      await expect(page.getByRole("button", { name: "Show Details panel", exact: true })).toBeFocused();
      if (selected) await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    }
  });
}
