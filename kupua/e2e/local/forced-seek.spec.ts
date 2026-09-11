import { test, expect } from "../shared/helpers";

test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

test("forced seek preserves identity through the core journey", async ({ kupua }) => {
  test.setTimeout(90_000);
  await kupua.goto();

  await test.step("50% track click paints a stable seek identity", async () => {
    await expect(kupua.scrubber).toHaveAttribute("data-scrubber-mode", "seek");
    const generationBefore = (await kupua.getStoreState()).seekGeneration;
    await kupua.seekTo(0.5, undefined, { waitForPositionMap: false });
    const state = await kupua.getStoreState();
    expect(state.seekGeneration).toBeGreaterThan(generationBefore);
    expect(state.error).toBeNull();

    await kupua.focusNthItem(5);
    const focusedId = (await kupua.getFocusedImageId())!;
    expect(focusedId).toBeTruthy();
    await expect(kupua.page.locator(`[data-image-id="${focusedId}"]`)).toBeVisible();
  });

  await test.step("focused End then Home reaches exact boundaries", async () => {
    const endGeneration = (await kupua.getStoreState()).seekGeneration;
    await kupua.page.keyboard.press("End");
    await kupua.waitForSeekGenerationBump(endGeneration);
    const endState = await kupua.getStoreState();
    expect(endState.error).toBeNull();
    expect(await kupua.getFocusedGlobalPosition()).toBe(endState.total - 1);
    expect(await kupua.isFocusedCellVisible()).toBe(true);

    const homeGeneration = endState.seekGeneration;
    await kupua.page.keyboard.press("Home");
    await kupua.waitForSeekGenerationBump(homeGeneration);
    const homeState = await kupua.getStoreState();
    expect(homeState.error).toBeNull();
    expect(homeState.bufferOffset).toBe(0);
    expect(await kupua.getFocusedGlobalPosition()).toBe(0);
    expect(await kupua.isFocusedCellVisible()).toBe(true);
  });
});