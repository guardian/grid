import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("http://localhost:3000/search?nonFree=true");
await page.waitForTimeout(3000);

// Grid is default — verify
const isGrid = await page.evaluate(() =>
  !!document.querySelector('[aria-label="Image results grid"]')
);
console.log("Is grid view:", isGrid);

for (let i = 0; i < 30; i++) {
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Image results grid"]');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const store = (window).__kupua_store__;
    if (!store) return null;
    const s = store.getState();
    return {
      bufferOffset: s.bufferOffset,
      resultsLength: s.results.length,
      total: s.total,
    };
  });
  if (state) console.log("Iter", i, JSON.stringify(state));
  if (state && state.resultsLength >= 800 && state.bufferOffset >= 100) {
    console.log("THRESHOLD REACHED at iteration", i);
    break;
  }
}

await browser.close();

