import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { heldImageServer } from "../shared/held-image-fixture";

test.use({ viewport: { width: 1720, height: 960 } });

async function prepareThumbnailFixture(page: Page, context: BrowserContext, baseURL: string, origin: string,
  density: "grid" | "justified", totalImages = 343) {
  const appOrigin = new URL(baseURL).origin;
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    const asset = url.origin === appOrigin && !/^\/(es|api|grid-|s3|imgproxy|bedrock)/.test(url.pathname);
    return asset || url.origin === origin ? route.continue() : route.fulfill({ status: 404, body: "isolated fixture" });
  });
  await context.route("**/src/lib/image-urls.ts*", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "if (!S3_PROXY_ENABLED) return undefined;";
    expect(source.split(marker)).toHaveLength(2);
    await route.fulfill({ response, body: source.replace(marker,
      `return image.thumbnail?.secureUrl ?? ${JSON.stringify(origin)} + "/image/" + image.id + ".svg";`)
      .replace("S3_PROXY_ENABLED || SYNTHETIC_PREVIEW_ENABLED", "true") });
  });
  await page.addInitScript(density => sessionStorage.setItem("kupua-density", density), density);
  await page.goto("/search?nonFree=true");
  await page.waitForFunction(() => Boolean((window as any).__kupua_store__));
  await page.evaluate(async totalImages => {
    const configPath = "/src/dal/es-config.ts";
    if (!(await import(configPath)).IS_LOCAL_ES) throw new Error("Thumbnail lifetime fixture requires local mode");
    const path = "/src/dal/mock-data-source.ts";
    const { MockDataSource } = await import(path);
    const store = (window as any).__kupua_store__;
    store.setState({ dataSource: new MockDataSource(totalImages) });
    await store.getState().search();
    await store.getState().extendForward();
  }, totalImages);
}

async function expectVisibleThumbnail(page: Page, density: "grid" | "justified", source: string) {
  await page.waitForFunction(({ density, source }) => {
    const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`);
    const cell = region?.querySelector<HTMLElement>('[data-image-id="img-6"]');
    const image = cell?.querySelector("img");
    if (!region || !cell || !image || image.src !== source) return false;
    const bounds = region.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    return rect.bottom > bounds.top && rect.top < bounds.bottom && getComputedStyle(image).display !== "none";
  }, { density, source });
}

test("Grid thumbnail cancellation recovers on reversal and preserves shared or completed images", async ({ page, context, baseURL }) => {
  let holdTarget = true;
  const targetPath = "/image/img-6.svg";
  const server = await heldImageServer({ hold: path => holdTarget && path === targetPath, limit: 2048 });
  try {
    await prepareThumbnailFixture(page, context, baseURL!, server.origin, "grid");
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    const targetRequests = () => server.requests.filter(request => request.path === targetPath);
    await expect.poll(() => targetRequests().length).toBe(1);
    const initialTarget = await region.locator('[data-image-id="img-6"] img').elementHandle();
    expect(await initialTarget!.evaluate(image => (image as HTMLImageElement).complete)).toBe(false);
    const source = (await initialTarget!.getAttribute("src"))!;
    await initialTarget!.dispose();
    await page.getByRole("button", { name: "Show Browse panel", exact: true }).click();
    await expectVisibleThumbnail(page, "grid", source);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(1);
    expect(targetRequests()[0].aborted).toBe(false);
    const target = await region.locator('[data-image-id="img-6"] img').elementHandle();
    expect(await target!.evaluate(image => (image as HTMLImageElement).complete)).toBe(false);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected && !image.hasAttribute("src"), target!);
    await expect.poll(() => targetRequests()[0].aborted).toBe(true);
    await region.evaluate(element => { element.scrollTop = 0; });
    await expectVisibleThumbnail(page, "grid", source);
    await expect.poll(() => targetRequests().length).toBe(2);
    expect(targetRequests()[0].finished).toBe(false);
    const sharedTarget = await region.locator('[data-image-id="img-6"] img').elementHandle();
    const consumer = await page.evaluateHandle(source => {
      const image = new Image(100, 100);
      image.src = source;
      document.body.append(image);
      return image;
    }, source);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected && !image.hasAttribute("src"), sharedTarget!);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(2);
    expect(targetRequests()[1].aborted).toBe(false);
    holdTarget = false;
    targetRequests()[1].release();
    await consumer.evaluate(image => image.decode());
    expect(await consumer.evaluate(image => image.naturalWidth)).toBe(100);
    await region.evaluate(element => { element.scrollTop = 0; });
    await expectVisibleThumbnail(page, "grid", source);
    const completed = await region.locator('[data-image-id="img-6"] img').elementHandle();
    await completed!.evaluate(image => (image as HTMLImageElement).decode());
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected, completed!);
    expect(await completed!.getAttribute("src")).toBe(source);
    expect(await completed!.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(100);
    expect(targetRequests()).toHaveLength(2);
    expect(targetRequests()[1].finished).toBe(true);
    await consumer.evaluate(image => image.remove());
    await consumer.dispose();
    await completed!.dispose();
    await sharedTarget!.dispose();
    await target!.dispose();
  } finally { await server.close(); }
});

test("Justified thumbnail survives reflow and density changes and reloads its replacement source", async ({ page, context, baseURL }) => {
  let holdTarget = true;
  const targetPath = "/image/img-6.svg";
  const replacementPath = "/image/replacement.svg";
  const server = await heldImageServer({ hold: path => holdTarget && [targetPath, replacementPath].includes(path), limit: 2048 });
  try {
    await prepareThumbnailFixture(page, context, baseURL!, server.origin, "justified");
    const region = page.getByRole("region", { name: "Image results justified", exact: true });
    const targetRequests = () => server.requests.filter(request => request.path === targetPath);
    await expect.poll(() => targetRequests().length).toBe(1);
    const source = (await region.locator('[data-image-id="img-6"] img').getAttribute("src"))!;
    await page.setViewportSize({ width: 590, height: 960 });
    await expectVisibleThumbnail(page, "justified", source);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(1);
    expect(targetRequests()[0].aborted).toBe(false);
    await page.setViewportSize({ width: 1720, height: 960 });
    await expectVisibleThumbnail(page, "justified", source);
    await page.getByRole("button", { name: "Grid view", exact: true }).click();
    await expectVisibleThumbnail(page, "grid", source);
    await page.getByRole("button", { name: "Justified view", exact: true }).click();
    await expectVisibleThumbnail(page, "justified", source);
    await page.waitForTimeout(200);
    expect(targetRequests()).toHaveLength(1);
    expect(targetRequests()[0].aborted).toBe(false);
    const target = await region.locator('[data-image-id="img-6"] img').elementHandle();
    const replacementSource = server.origin + replacementPath;
    await page.evaluate(source => {
      const store = (window as any).__kupua_store__;
      store.setState({ results: store.getState().results.map((image: { id: string; thumbnail?: object }) =>
        image.id === "img-6" ? { ...image, thumbnail: { ...image.thumbnail, secureUrl: source } } : image) });
    }, replacementSource);
    await expect.poll(() => target!.getAttribute("src")).toBe(replacementSource);
    expect(await target!.evaluate(image => image === document.querySelector(
      '[aria-label="Image results justified"] [data-image-id="img-6"] img'))).toBe(true);
    const replacements = () => server.requests.filter(request => request.path === replacementPath);
    await expect.poll(() => replacements().length).toBe(1);
    await page.waitForTimeout(200);
    expect(replacements()[0].aborted).toBe(false);
    expect(await target!.getAttribute("src")).toBe(replacementSource);
    await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(image => !image.isConnected && !image.hasAttribute("src"), target!);
    await expect.poll(() => replacements()[0].aborted).toBe(true);
    holdTarget = false;
    for (const request of server.requests) request.release();
    await region.evaluate(element => { element.scrollTop = 0; });
    await expectVisibleThumbnail(page, "justified", replacementSource);
    await region.locator('[data-image-id="img-6"] img').evaluate(image => (image as HTMLImageElement).decode());
    expect(await region.locator('[data-image-id="img-6"] img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(100);
    expect(replacements()).toHaveLength(2);
    expect(replacements()[0].finished).toBe(false);
    expect(replacements()[1].finished).toBe(true);
    await target!.dispose();
  } finally { await server.close(); }
});

async function decodeVisibleThumbnails(page: Page) {
  await page.evaluate(async () => {
    const region = document.querySelector('[aria-label="Image results grid"]')!;
    const bounds = region.getBoundingClientRect();
    await Promise.all([...region.querySelectorAll<HTMLImageElement>('[data-grid-cell] img')].filter(image => {
      const rect = image.getBoundingClientRect();
      return rect.top < bounds.bottom && rect.bottom > bounds.top;
    }).map(image => image.decode()));
  });
}

async function paintedColours(page: Page, png: Buffer, points: { x: number; y: number }[]) {
  return page.evaluate(async ({ png, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return points.map(point => [...ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data]);
  }, { png: png.toString('base64'), points });
}

for (const columns of [3, 4, 6]) {
  test(`Grid seek preserves painted thumbnail slots across remainder changes (${columns} columns)`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: columns * 280 + 40, height: 960 });
    let holding = false;
    const colours = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8000', '#8000ff'];
    const rasters = await page.evaluate(colours => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      return colours.map(colour => { ctx.fillStyle = colour; ctx.fillRect(0, 0, 100, 100); return canvas.toDataURL('image/png').split(',')[1]; });
    }, colours);
    const server = await heldImageServer({ hold: () => holding, holdHeaders: true, limit: 4096, imageContentType: 'image/png', imageBody: path => {
      const index = Number(path.match(/img-(\d+)/)?.[1]);
      return Buffer.from(rasters[index % rasters.length], 'base64');
    } });
    try {
      await prepareThumbnailFixture(page, context, baseURL!, server.origin, 'grid', 80_003);
      const region = page.getByRole('region', { name: 'Image results grid', exact: true });
      expect(await region.evaluate(element => Math.floor(element.clientWidth / 280))).toBe(columns);
      const target = (base: number, remainder: number) => base + ((100 + remainder - base) % columns + columns) % columns;
      await page.evaluate(async offset => { await (window as any).__kupua_store__.getState().seek(offset); }, target(2000, 0));
      // Stay clear of destination headroom adjustment and trailing-buffer clamping.
      await region.evaluate(async (element, columns) => {
        element.scrollTop = Math.ceil(160 / columns) * 303;
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      }, columns);
      await decodeVisibleThumbnails(page);
      let changedRemainders = 0;
      for (const [base, remainder] of [[4000, 1], [6000, 0], [8000, 0]]) {
        const previousRemainder = await page.evaluate(columns => (window as any).__kupua_store__.getState().bufferOffset % columns, columns);
        const snapshot = await region.evaluateHandle(region => {
          const bounds = region.getBoundingClientRect();
          return { region, scrollTop: region.scrollTop, cells: [...region.querySelectorAll<HTMLElement>('[data-grid-cell]')]
            .filter(cell => { const rect = cell.getBoundingClientRect(); return rect.top >= bounds.top && rect.bottom <= bounds.bottom; })
            .map(cell => { const rect = cell.getBoundingClientRect(); return { cell, image: cell.querySelector('img')!,
              id: cell.dataset.imageId, left: rect.left, top: rect.top,
              point: { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + 95 - bounds.top } }; }) };
        });
        try {
          const points = await snapshot.evaluate(snapshot => snapshot.cells.map(cell => cell.point));
          expect(points.length).toBeGreaterThanOrEqual(columns * 2);
          const before = await paintedColours(page, await region.screenshot({ scale: 'css' }), points);
          expect(new Set(before.map(colour => colour.join(','))).size).toBeGreaterThanOrEqual(columns);
          holding = true;
          const previousGeneration = await page.evaluate(() => (window as any).__kupua_store__.getState()._seekGeneration);
          await page.evaluate(async offset => { await (window as any).__kupua_store__.getState().seek(offset); }, target(base, remainder));
          await page.waitForFunction(previous => (window as any).__kupua_store__.getState()._seekGeneration === previous + 1, previousGeneration);
          const nextRemainder = await page.evaluate(columns => (window as any).__kupua_store__.getState().bufferOffset % columns, columns);
          if (nextRemainder !== previousRemainder) changedRemainders++;
          await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
          for (let frame = 0; frame < 3; frame++) {
            expect(await paintedColours(page, await region.screenshot({ scale: 'css' }), points),
              'Pending replacement must retain pre-seek pixels in their original slots').toEqual(before);
          }
          const retained = await snapshot.evaluate(snapshot => ({ scrollTop: snapshot.region.scrollTop,
            cells: snapshot.cells.map(({ cell, image, id, left, top }) => ({ connected: cell.isConnected && image.isConnected,
              sameImage: cell.querySelector('img') === image, changed: cell.dataset.imageId !== id,
              dx: cell.getBoundingClientRect().left - left, dy: cell.getBoundingClientRect().top - top,
              pending: !image.complete })) }));
          expect(retained.scrollTop).toBe(await snapshot.evaluate(snapshot => snapshot.scrollTop));
          for (const cell of retained.cells) expect(cell).toEqual({ connected: true, sameImage: true, changed: true, dx: 0, dy: 0, pending: true });
        } finally {
          holding = false;
          for (const request of server.requests) request.release();
          await snapshot.dispose();
        }
        await decodeVisibleThumbnails(page);
        const destination = await region.evaluate((region, colours) => {
          const bounds = region.getBoundingClientRect();
          return [...region.querySelectorAll<HTMLElement>('[data-grid-cell]')].filter(cell => {
            const rect = cell.getBoundingClientRect(); return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
          }).map(cell => {
            const rect = cell.getBoundingClientRect();
            const colour = colours[Number(cell.dataset.imageId!.slice(4)) % colours.length];
            return { point: { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + 95 - bounds.top },
              colour: [1, 3, 5].map(index => parseInt(colour.slice(index, index + 2), 16)).concat(255) };
          });
        }, colours);
        expect(await paintedColours(page, await region.screenshot({ scale: 'css' }), destination.map(cell => cell.point)))
          .toEqual(destination.map(cell => cell.colour));
      }
      expect(changedRemainders, 'Exercise a changed row remainder, not only same-slot replacement').toBeGreaterThan(0);
    } finally { await server.close(); }
  });
}

test('Grid partial leading rows retain actual column slots in both directions', async ({ page, context, baseURL }) => {
  const server = await heldImageServer({ hold: () => false, limit: 4096 });
  try {
    await prepareThumbnailFixture(page, context, baseURL!, server.origin, 'grid', 80_003);
    await page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      store.setState({ extendBackward: async () => {}, extendForward: async () => {} });
    });
    for (const columns of [3, 4, 6]) {
      await page.setViewportSize({ width: columns * 280 + 40, height: 960 });
      const region = page.getByRole('region', { name: 'Image results grid', exact: true });
      expect(await region.evaluate(element => Math.floor(element.clientWidth / 280))).toBe(columns);
      let previous: Awaited<ReturnType<typeof region.evaluateHandle>> | undefined;
      try {
        for (const remainder of [0, 1, columns - 1, 2, 0, 0]) {
          await page.evaluate(({ columns, remainder }) => {
            const store = (window as any).__kupua_store__;
            const state = store.getState();
            const offset = columns * 100 + remainder;
            store.setState({ bufferOffset: offset, results: [...state.results],
              imagePositions: new Map(state.results.map((image: { id: string }, index: number) => [image.id, offset + index])),
              _seekGeneration: state._seekGeneration + 1, _seekTargetLocalIndex: 0, _seekTargetGlobalIndex: -1 });
          }, { columns, remainder });
          await region.evaluate(async element => { element.scrollTop = 0; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
          const current = await region.evaluateHandle((region, columns) => {
            const cells = [...region.querySelectorAll<HTMLElement>('[data-grid-cell]')];
            const firstTop = cells[0].getBoundingClientRect().top;
            return cells.filter(cell => cell.getBoundingClientRect().top === firstTop).map(cell => {
              const rect = cell.getBoundingClientRect();
              return { cell, image: cell.querySelector('img'), left: rect.left,
                column: Math.round((rect.left - region.getBoundingClientRect().left - 8) / ((region.clientWidth - 8) / columns)) };
            });
          }, columns);
          expect(await current.evaluate(cells => cells.map(cell => cell.column))).toEqual(
            Array.from({ length: columns - remainder }, (_, index) => remainder + index));
          if (previous) {
            const comparisons = await page.evaluate(({ previous, current }) => current.flatMap((next: any) => {
              const old = (previous as any[]).find(old => old.column === next.column);
              return old ? [{ cell: old.cell === next.cell, image: old.image === next.image, left: old.left === next.left }] : [];
            }), { previous, current });
            expect(comparisons.length).toBeGreaterThan(0);
            for (const comparison of comparisons) expect(comparison).toEqual({ cell: true, image: true, left: true });
          }
          await previous?.dispose();
          previous = current;
        }
      } finally { await previous?.dispose(); }
    }
  } finally { await server.close(); }
});

for (const density of ['grid', 'justified'] as const) {
  test(`${density} reused thumbnail recovers from failed replacements without losing its border`, async ({ page, context, baseURL }) => {
    let holding = false;
    const server = await heldImageServer({ hold: path => holding && path.includes('replacement'), limit: 2048,
      imageBody: path => path.includes('broken') ? 'invalid image' : '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>' });
    try {
      await prepareThumbnailFixture(page, context, baseURL!, server.origin, density);
      const target = await page.locator(`[aria-label="Image results ${density}"] [data-image-id="img-6"] img`).elementHandle();
      await target!.evaluate(image => (image as HTMLImageElement).decode());
      const replace = async (path: string) => {
        await page.evaluate(source => {
          const store = (window as any).__kupua_store__;
          store.setState({ results: store.getState().results.map((image: { id: string; thumbnail?: object }) =>
            image.id === 'img-6' ? { ...image, thumbnail: { ...image.thumbnail, secureUrl: source } } : image) });
        }, server.origin + path);
        await expect.poll(() => target!.getAttribute('src')).toBe(server.origin + path);
      };
      await target!.evaluate(image => { (image as HTMLElement).style.border = '3px solid rgb(255, 0, 0)'; });
      for (const suffix of ['a', 'b']) {
        await replace(`/image/broken-${suffix}.svg`);
        await page.waitForFunction(image => (image as HTMLElement).style.display === 'none', target!);
      }
      holding = true;
      await replace('/image/replacement-held.svg');
      await expect.poll(() => server.requests.filter(request => request.path === '/image/replacement-held.svg').length).toBe(1);
      expect(await target!.evaluate(image => (image as HTMLElement).style.display)).toBe('none');
      holding = false;
      for (const request of server.requests) request.release();
      await target!.evaluate(image => (image as HTMLImageElement).decode());
      await expect.poll(() => target!.evaluate(image => getComputedStyle(image).display)).not.toBe('none');
      expect(await target!.evaluate(image => image.isConnected && image.parentElement?.querySelector('img') === image)).toBe(true);
      expect(await target!.evaluate(image => (image as HTMLElement).style.border)).toBe('3px solid rgb(255, 0, 0)');
      for (const obsoleteFails of [true, false]) {
        holding = true;
        const path = `/image/replacement-late-${obsoleteFails ? 'broken' : 'valid'}.svg`;
        await replace(path);
        await expect.poll(() => server.requests.filter(request => request.path === path).length).toBe(1);
        await replace(obsoleteFails ? '/image/img-6.svg' : '/image/broken-current.svg');
        if (obsoleteFails) await target!.evaluate(image => (image as HTMLImageElement).decode());
        await expect.poll(() => target!.evaluate(image => getComputedStyle(image).display === 'none')).toBe(!obsoleteFails);
        holding = false;
        for (const request of server.requests) request.release();
        await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
        expect(await target!.evaluate(image => getComputedStyle(image).display === 'none')).toBe(!obsoleteFails);
      }
      await target!.dispose();
    } finally { await server.close(); }
  });
}