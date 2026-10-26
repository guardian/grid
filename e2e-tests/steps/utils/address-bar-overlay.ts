import type { Disposable, Page } from '@playwright/test';
import { Before } from '../setup.ts';

const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function readableUrl(url: string): string {
    try {
        return decodeURI(url);
    } catch {
        return url;
    }
}

const addressBarHtml = (url: string) => `
  <div style="position:absolute;left:0;right:0;bottom:0;display:flex;gap:10px;align-items:center;
              padding:8px 14px;background:rgba(32,33,36,0.92);color:#e8eaed;
              font:15px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 -1px 4px rgba(0,0,0,0.4)">
    <span style="color:#9aa0a6">Address</span>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(readableUrl(url))}</span>
  </div>`;

/**
 * Show the page's current URL in a bar along the bottom of the video, since recordings
 * only capture the page and not the browser's own address bar. Playwright draws overlays
 * outside the page's DOM, so locators and clicks are unaffected.
 */
function showAddressBarInVideo(page: Page): void {
    let overlay: Disposable | undefined;
    // Serialise updates so a quick run of navigations can't leave a stale bar behind.
    let queue = Promise.resolve();
    const update = () => {
        queue = queue
            .then(async () => {
                await overlay?.dispose();
                overlay = await page.screencast.showOverlay(addressBarHtml(page.url()));
            })
            .catch(() => { });
    };
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) update();
    });
}

Before(async ({ page }) => {
    if (page.video()) showAddressBarInVideo(page);
});
