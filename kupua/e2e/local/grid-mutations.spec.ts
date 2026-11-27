import { expect, type Dialog, type JSHandle, type Locator, type Page } from "@playwright/test";
import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { build, createServer } from "vite";
import type * as Commands from "../../src/lib/grid-commands";
import type { labelEditorFixture } from "../shared/label-editor-fixture";
import { GRID_API_READ_VIA_POST } from "../../src/dal/grid-api/read-via-post";
import { gridServiceProxyRoutes } from "../../src/lib/grid-mutation-policy";
import { gridMutationPlugin, virtualEntry } from "../shared/grid-mutation-plugin";
import { getDensityChangeButton } from "../shared/density-selection";
import { test, KupuaHelpers, waitForFixtureSetup } from "../shared/helpers";
import type { useSearchStore } from "../../src/stores/search-store";
import type { useSelectionStore } from "../../src/stores/selection-store";

type CommandWindow = typeof window & { commandFixture: typeof Commands; editorFixture: typeof labelEditorFixture;
  __kupua_store__: typeof useSearchStore; __kupua_selection_store__: typeof useSelectionStore };
const fixturePlugin = gridMutationPlugin();

async function addCollection(scope: Locator | Page, name: string) {
  await scope.getByRole("button", { name: "Add collection", exact: true }).click();
  await scope.getByLabel("New collection", { exact: true }).fill(name);
  await scope.getByRole("button", { name: "Commit new collection", exact: true }).click();
}

const collectionIds = (page: Page, origin: string, ids: string[]) => Promise.all(ids.map(async id => {
  const response = await page.request.get(`${origin}/api/images/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).data.collections.map((member: { data: { pathId: string } }) => member.data.pathId).sort();
}));

test.describe("U3 isolated uploads", () => {
  let vite: Awaited<ReturnType<typeof createServer>>;
  let origin: string;
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_MEDIA_DELIVERY: "canonical", VITE_GRID_LOADER_ORIGIN: "https://loader.example.test", VITE_GRID_AUTH_ORIGIN: "https://auth.example.test" };
  let previous: Record<string, string | undefined>;
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("kupua-upload-density")) sessionStorage.setItem("kupua-upload-density", new URL(location.href).searchParams.get("density") ?? "grid");
    });
  });
  test.beforeAll(async ({}, testInfo) => {
    previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"),
      plugins: [gridMutationPlugin("upload")], server: { host: "127.0.0.1", port: 0 } });
    await vite.listen();
    origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
  });
  test.afterAll(async () => {
    await vite?.close();
    for (const [key, value] of Object.entries(previous ?? {})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  test("tree submission distinguishes rejection, uncertainty and failed readback without replay", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kupua-allow-editing", "true"));
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, editing: true } });
    const href = "https://media-collections.local.dev-gutools.co.uk/collections/Desk";
    const node = { uri: href, data: { basename: "Desk", fullPath: ["Desk"], data: { path: ["Desk"], pathId: "desk" }, children: [] }, links: [], actions: [{ name: "add-child", method: "POST", href }] };
    let mode = "denied", writes = 0, failRead = false;
    await page.route("**/grid-local-collections/collections**", route => {
      if (route.request().method() === "GET") {
        if (failRead) { failRead = false; return route.fulfill({ status: 503 }); }
        return route.fulfill({ json: { data: { children: [node] }, actions: [] } });
      }
      expect(route.request().method()).toBe("POST");
      expect(new URL(route.request().url()).pathname).toBe("/grid-local-collections/collections/Desk");
      writes++;
      if (mode === "lost") return route.abort();
      failRead = mode === "refresh";
      return route.fulfill({ status: failRead ? 200 : 403 });
    });
    await page.goto(`${origin}/__readback?density=grid`);
    const showBrowse = page.getByRole("button", { name: "Show Browse panel" });
    const header = page.getByRole("button", { name: "Collections", exact: true });
    await expect(showBrowse.or(header).first()).toBeVisible();
    if (await showBrowse.isVisible()) await showBrowse.click();
    if (await header.getAttribute("aria-expanded") === "false") await header.click();
    await page.getByRole("button", { name: "Edit collections", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Actions for Desk", exact: true });
    const popup = page.getByRole("dialog", { name: "Collection actions for Desk" });
    for (const [outcome, receipt] of [["denied", "Grid rejected the change (403)."], ["lost", "Submission uncertain."], ["refresh", "Grid accepted the change. Reload the page"]]) {
      mode = outcome;
      const previous = writes;
      await trigger.click();
      await popup.getByRole("button", { name: "New subcollection" }).click();
      await popup.getByRole("textbox").fill("Pictures");
      await popup.getByRole("button", { name: "Create", exact: true }).click();
      await expect(popup.getByRole("status")).toContainText(receipt);
      await popup.getByRole("button", { name: "Cancel" }).click();
      await expect(trigger).toBeFocused();
      await expect(page.locator(".collection-actions-shell")).toHaveCount(0);
      expect(writes).toBe(previous + 1);
    }
  });

  test("selection draft follows the open panel and protects the last selected body double-click", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kupua-allow-editing", "true"));
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, editing: true } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 10 } });
    const writes = async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).metadataWrites;
    await page.goto(`${origin}/__readback?density=grid`);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0"]));
    await page.getByRole("button", { name: "Edit Description", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Description", exact: true });
    await input.fill("Selection draft");
    const body = (id: string) => page.locator(`[data-grid-cell][data-cell-id="${id}"]`);
    const selected = () => page.evaluate(() => [...(window as CommandWindow).__kupua_selection_store__.getState().selectedIds]);
    await body("local-1").click();
    await expect.poll(selected).toEqual(["local-0", "local-1"]);
    await body("local-0").click();
    await expect.poll(selected).toEqual(["local-1"]);
    await expect(input).toHaveValue("Selection draft");
    const departure = async (accept: boolean, attempt: () => Promise<unknown>) => {
      await Promise.all([page.waitForEvent("dialog", { timeout: 5000 }).then(async prompt => {
        const observed = [prompt.type(), prompt.message()];
        if (accept) await prompt.accept(); else await prompt.dismiss();
        expect(observed).toEqual(["confirm", "Discard your Description edit?"]);
      }), attempt()]);
    };
    await departure(false, () => body("local-1").dblclick());
    await page.evaluate(() => (window as CommandWindow).__kupua_store__.setState({ newCount: 1 }));
    await departure(false, () => page.getByRole("button", { name: "1 new", exact: true }).click());
    expect(await selected()).toEqual(["local-1"]);
    await expect(input).toHaveValue("Selection draft");
    expect(await writes()).toEqual([]);
    await page.getByRole("button", { name: "Commit Description", exact: true }).click();
    await expect.poll(writes).toEqual([expect.objectContaining({ id: "local-1", method: "PUT", data: expect.objectContaining({ description: "Selection draft" }) })]);
    const edit = page.getByRole("button", { name: "Edit Description", exact: true });
    await edit.click();
    await input.fill("Not saved");
    await departure(false, () => page.getByRole("button", { name: "Deselect", exact: true }).click());
    await departure(true, () => body("local-1").dblclick());
    await expect(page.locator('[data-detail-image-id="local-1"]')).toBeVisible();
    await edit.click();
    await expect(input).toHaveValue("Selection draft");
    await input.fill("Full Detail only");
    await departure(false, () => page.evaluate(() => history.back()));
    await expect(page).toHaveURL(/image=local-1/);
    await expect(input).toHaveValue("Full Detail only");
    await departure(true, () => page.evaluate(() => history.back()));
    await expect(page).not.toHaveURL(/image=local-1/);
    await expect(input).toHaveCount(0);
    await edit.click();
    await input.fill("Reload draft");
    for (const leave of [false, true]) {
      const warning = page.waitForEvent("dialog");
      await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
      const native = await warning;
      expect(native.type()).toBe("beforeunload");
      if (leave) await native.accept();
      else { await native.dismiss(); await expect(input).toHaveValue("Reload draft"); }
    }
    await expect(input).toHaveCount(0);
    expect(await writes()).toHaveLength(1);
    await page.goto(`${origin}/__readback?density=grid`);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-1"]));
    await addCollection(page, "news");
    await expect.poll(() => collectionIds(page, origin, ["local-0", "local-1", "local-2"])).toEqual([["news"], ["news"], []]);
    await page.getByRole("button", { name: "Add lease", exact: true }).click();
    const lease = page.getByRole("form", { name: "New lease" });
    await lease.getByLabel("Access").selectOption("allow-syndication");
    await lease.getByLabel("Premium").check();
    await lease.getByRole("button", { name: "Save lease" }).click();
    await expect(page.getByText("Allow syndication", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete Allow syndication lease" })).toHaveCount(0);
    await body("local-1").dblclick();
    const detail = page.locator('[data-detail-image-id="local-1"]');
    await expect(detail.getByText("PREMIUM", { exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "Delete Allow syndication lease" }).click();
    const confirmDelete = detail.getByRole("button", { name: "Confirm delete Allow syndication lease" });
    await expect(confirmDelete).toHaveText("Confirm delete");
    await expect(detail.getByText("PREMIUM", { exact: true })).toBeVisible();
    await confirmDelete.press("Escape");
    await detail.getByRole("button", { name: "Delete Allow syndication lease" }).click();
    await confirmDelete.click();
    await expect(detail.getByText("PREMIUM", { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/images/local-0`)).json()).data.leases.data.leases.length).toBe(1);
  });

  test("U5 saves Form and Details metadata and captures only the open upper batch", async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => {
      localStorage.setItem("kupua-allow-uploads", "true");
      localStorage.setItem("kupua-allow-editing", "true");
    });
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, editing: true, multiple: true, status: "COMPLETED", visible: true, searchable: true } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 5 } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    await page.getByRole("button", { name: "My recent uploads", exact: true }).click();
    await page.getByRole("textbox", { name: "Preset label", exact: true }).fill("submitted preset");
    await page.getByRole("button", { name: "Add label to all uploads", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 3 }, (_, index) => ({
      name: `u5_${index}.original.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(`U5 image ${index}`),
    })));
    const batch = new URL(page.url()).searchParams.get("batch")!;
    const results = async () => (await (await page.request.get(`${origin}/__upload-control`)).json()) as {
      metadata: Record<string, { description?: string; credit?: string; byline?: string; dateTaken?: string; domainMetadata?: unknown }>;
      labels: Record<string, string[]>; metadataWrites: { id: string; method: string; data: Record<string, unknown> }[];
      metadataReads: Record<string, number>;
      collectionWrites: { id: string; method: string; pathId: string }[];
    };
    await expect.poll(() => page.evaluate(async batchId => {
      const path = "/src/stores/upload-jobs-store.ts";
      const { useUploadJobsStore } = await import(path) as typeof import("../../src/stores/upload-jobs-store");
      return useUploadJobsStore.getState().batches.find(item => item.id === batchId)?.attempts.filter(attempt => attempt.phase === "complete").length;
    }, batch)).toBe(3);
    await expect.poll(async () => Object.keys((await results()).labels).length).toBe(3);
    await expect(page.getByRole("button", { name: "Upload activity: 3 completed", exact: true })).toBeVisible();
    await expect.poll(async () => Object.values((await results()).metadata).map(value => value.description).sort())
      .toEqual(["u5 0.original", "u5 1.original", "u5 2.original"]);
    const ids = Object.keys((await results()).labels);
    const form = page.getByRole("region", { name: "Image results form", exact: true });
    const first = form.locator(`[data-measured-cell][data-image-id="${ids[0]}"]`);
    await expect(first.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("u5 0.original");
    const description = first.getByRole("textbox", { name: "Description", exact: true });
    const creditInput = first.getByLabel("Credit", { exact: true });
    const dateInput = first.getByLabel("Taken on", { exact: true });
    await creditInput.fill("");
    await creditInput.press("Tab");
    await expect.poll(async () => (await results()).metadataWrites.some(write => write.id === ids[0] && write.method === "PUT" && !write.data.credit)).toBe(true);
    await expect(creditInput).toHaveValue("");
    const requiredBorder = await creditInput.evaluate(element => getComputedStyle(element).borderTopColor);
    const dateIcon = await dateInput.evaluate(element => getComputedStyle(element).backgroundImage);
    await expect(creditInput).toHaveCSS("border-top-color", "rgb(237, 89, 53)");
    expect(dateIcon).toContain("image/svg+xml");
    const calendarPoint = await dateInput.evaluate(element => ({ x: element.clientWidth - 16, y: element.clientHeight / 2 }));
    await dateInput.click({ position: calendarPoint });
    await expect(dateInput).toHaveJSProperty("type", "datetime-local");
    expect(await dateInput.evaluate(element => element.matches(":open"))).toBe(true);
    await page.keyboard.press("Escape");
    const ownWrite = `**/grid-metadata/metadata/${ids[0]}/metadata`;
    let releaseOwn!: () => void;
    const heldOwn = new Promise<void>(resolve => { releaseOwn = resolve; });
    const dispatchedOwn = page.waitForRequest(request => request.method() === "PUT" && request.url().endsWith(`/metadata/${ids[0]}/metadata`));
    await page.route(ownWrite, async route => { if (route.request().method() === "PUT") await heldOwn; await route.continue(); });
    try {
      await description.fill("Typing while saving");
      await dispatchedOwn;
      await page.evaluate(async id => {
        const freshnessPath = "/src/lib/image-read-freshness.ts";
        const enrichmentPath = "/src/stores/enrichment-store.ts";
        const publicationPath = "/src/lib/image-publication.ts";
        const { acceptImageOverlay, acceptImageRead } = await import(freshnessPath);
        const { attachedEnrichment } = await import(enrichmentPath);
        const { publishImage } = await import(publicationPath);
        const source = (window as CommandWindow).__kupua_store__.getState().dataSource;
        const [membership] = await source.getByIds([id]);
        const [confirmation] = await source.getByIds([id]);
        if (!membership || !confirmation || acceptImageRead(membership) !== membership) throw new Error("Missing current membership read");
        acceptImageOverlay(id, attachedEnrichment(confirmation));
        publishImage(membership, attachedEnrichment(membership));
      }, ids[0]);
      await expect(first.locator('[data-measured-field="metadata_description"] [data-grant-pending]')).toBeVisible();
      await expect(first.getByRole("button", { name: "Saving Description", exact: true })).toBeVisible();
      await expect(first.getByRole("button", { name: /^Apply Description/ }).and(page.locator(":enabled"))).toHaveCount(0);
      await expect(creditInput).toHaveCSS("border-top-color", requiredBorder);
      await expect(dateInput).toHaveCSS("background-image", dateIcon);
      await expect(description).toBeFocused();
      await page.keyboard.type(" continues");
      await expect(description).toHaveValue("Typing while saving continues");
    } finally { releaseOwn(); await page.unroute(ownWrite); }
    await expect.poll(async () => (await results()).metadata[ids[0]].description).toBe("Typing while saving continues");
    await first.getByLabel("Byline", { exact: true }).focus();
    const composition = await page.context().newCDPSession(page);
    let composing = false;
    try {
      await composition.send("Input.imeSetComposition", { text: "Composed author", selectionStart: 15, selectionEnd: 15 });
      composing = true;
      await page.clock.install();
      await page.clock.runFor(700);
      expect((await results()).metadata[ids[0]].byline).toBeUndefined();
      await composition.send("Input.insertText", { text: "Composed author" });
      composing = false;
      await first.getByLabel("Byline", { exact: true }).press("Tab");
      await expect.poll(async () => (await results()).metadata[ids[0]].byline).toBe("Composed author");
    } finally {
      if (composing) await composition.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
      await composition.detach();
    }
    const takenOn = first.getByLabel("Taken on", { exact: true });
    await takenOn.fill("2026-11-18T12:00");
    for (let segment = 0; segment < 8; segment++) await takenOn.press("ArrowLeft");
    await takenOn.press("Backspace"); await takenOn.press("0"); await takenOn.press("2");
    await takenOn.press("Tab");
    const expectedDate = await page.evaluate(() => new Date("2026-11-02T12:00:00").toISOString());
    await expect.poll(async () => (await results()).metadata[ids[0]].dateTaken).toBe(expectedDate);
    await page.request.post(`${origin}/__upload-control`, { data: { embeddedDescription: { filename: "newer.jpg", value: "Embedded caption" } } });
    const desktopViewport = page.viewportSize()!;
    const fieldArrow = (id: string) => first.locator(`[data-measured-field="${id}"] .metadata-batch-tool > button`);
    const expectedEdge = (await fieldArrow("metadata_credit").boundingBox())!.x;
    for (const id of ["collections", "labels", "people", "keywords", "photoshoot"]) {
      await expect(fieldArrow(id)).toBeVisible();
      expect(Math.abs((await fieldArrow(id).boundingBox())!.x - expectedEdge)).toBeLessThanOrEqual(1);
    }
    const collectionField = first.locator('[data-measured-field="collections"]');
    const batchCollections = () => collectionIds(page, origin, ids);
    await addCollection(first, "news");
    await expect(collectionField.getByText("news", { exact: true })).toBeVisible();
    await addCollection(form.locator(`[data-measured-cell][data-image-id="${ids[1]}"]`), "sport");
    await expect.poll(batchCollections).toEqual([["news"], ["sport"], []]);
    await fieldArrow("collections").click();
    await expect.poll(batchCollections).toEqual([["news"], ["news", "sport"], ["news"]]);
    await collectionField.getByRole("button", { name: /^Remove news/i }).click();
    await expect.poll(batchCollections).toEqual([[], ["news", "sport"], ["news"]]);
    const beforeClear = (await results()).collectionWrites.length;
    await fieldArrow("collections").click();
    const confirmCollections = collectionField.getByRole("button", { name: "Remove ALL collections from the 2 other images?", exact: true });
    await expect(confirmCollections).toBeVisible();
    expect((await results()).collectionWrites).toHaveLength(beforeClear);
    await confirmCollections.click();
    await expect.poll(batchCollections).toEqual([[], [], []]);
    expect((await results()).collectionWrites.slice(beforeClear).map(write => [write.id, write.method, write.pathId]).sort()).toEqual([
      [ids[1], "DELETE", "news"], [ids[1], "DELETE", "sport"], [ids[2], "DELETE", "news"],
    ].sort());
    const shoot = first.getByLabel("Photoshoot", { exact: true });
    const memberships = () => Promise.all(ids.map(async id => (await (await page.request.get(`${origin}/api/images/${id}`)).json()).data.userMetadata.data.photoshoot.data?.title ?? ""));
    await shoot.fill("Desk assignment");
    await page.clock.runFor(700);
    expect(await memberships()).toEqual(["", "", ""]);
    await shoot.press("Tab");
    await expect.poll(memberships).toEqual(["Desk assignment", "", ""]);
    await first.getByRole("button", { name: "Apply Photoshoot to 2 other images", exact: true }).click();
    await expect.poll(memberships).toEqual(ids.map(() => "Desk assignment"));
    await shoot.fill(""); await shoot.press("Tab");
    await expect.poll(memberships).toEqual(["", "Desk assignment", "Desk assignment"]);
    await first.getByRole("button", { name: "Clear Photoshoot on 2 other images", exact: true }).click();
    await expect(first.getByRole("button", { name: "Clear Photoshoot on 2 other images?", exact: true })).toBeVisible();
    expect(await memberships()).toEqual(["", "Desk assignment", "Desk assignment"]);
    await first.getByRole("button", { name: "Clear Photoshoot on 2 other images?", exact: true }).click();
    await expect.poll(memberships).toEqual(["", "", ""]);
    await expect(fieldArrow("labels")).toBeEnabled();
    await expect(fieldArrow("keywords")).toHaveAttribute("title", "Clear keywords on 2 other images");
    const leasePlus = await first.getByRole("button", { name: "Add lease", exact: true }).boundingBox();
    const labelPlus = await first.getByRole("button", { name: "Add label", exact: true }).boundingBox();
    expect(Math.abs(leasePlus!.x - labelPlus!.x)).toBeLessThanOrEqual(1);
    const touch = await page.context().newCDPSession(page);
    await page.setViewportSize({ width: 412, height: 830 });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await expect(page.locator('[data-shell="compact"]').first()).toBeVisible();
    const copyLeases = first.getByRole("button", { name: "Replace leases on all 2 other images" });
    const clearLeases = first.getByRole("button", { name: "Clear leases on 2 other images" });
    await expect(clearLeases).toHaveAttribute("title", "Clear leases on 2 other images");
    const creditArrow = first.locator('[data-measured-field="metadata_credit"] .metadata-batch-tool > button');
    await expect(clearLeases).toHaveCSS("color", await creditArrow.evaluate(button => getComputedStyle(button).color));
    const copyInsideHeader = () => clearLeases.or(copyLeases).evaluate(button => {
      const header = button.closest(".lease-header-actions")?.parentElement;
      if (!header || !header.textContent?.includes("Leases")) return false;
      const bounds = header.getBoundingClientRect(), control = button.getBoundingClientRect();
      return control.width > 0 && control.left >= bounds.left - 1 && control.right <= bounds.right + 1
        && control.top >= bounds.top - 1 && control.bottom <= bounds.bottom + 1;
    });
    await expect.poll(copyInsideHeader).toBe(true);
    await expect(first.getByText("No leases", { exact: true })).toHaveCount(0);
    await first.getByRole("button", { name: "Add lease", exact: true }).click();
    const leaseForm = first.getByRole("form", { name: "New lease" });
    await leaseForm.getByLabel("Access").selectOption("allow-use");
    await expect(leaseForm.getByLabel("Notes")).toHaveCSS("border-top-style", "solid");
    await expect(leaseForm.getByLabel("Expires", { exact: true })).toHaveValue(/T23:59$/);
    await leaseForm.getByRole("checkbox", { name: "Set expiry" }).uncheck();
    for (const [caption, value] of [["Delay start", "Starts now"], ["Set expiry", "No expiry"]]) {
      const offset = await leaseForm.evaluate((form, [caption, value]) => {
        const walker = document.createTreeWalker(form, NodeFilter.SHOW_TEXT);
        const tops = new Map<string, number>();
        while (walker.nextNode()) {
          const text = walker.currentNode.textContent?.trim();
          if (text !== caption && text !== value) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          tops.set(text, range.getBoundingClientRect().top);
        }
        return Math.abs(tops.get(caption)! - tops.get(value)!);
      }, [caption, value]);
      expect(offset, `${caption} and ${value} text alignment`).toBeLessThanOrEqual(1);
    }
    await expect(leaseForm.getByRole("button", { name: "Save lease" }).locator('svg')).toBeVisible();
    await expect(leaseForm.getByRole("button", { name: "Cancel" }).locator('svg')).toBeVisible();
    await leaseForm.getByLabel("Notes").fill("Fixture desk lease");
    await leaseForm.getByRole("button", { name: "Save lease" }).click();
    await expect(first.getByText("Fixture desk lease", { exact: true })).toBeVisible();
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await touch.detach();
    await page.setViewportSize(desktopViewport);
    await expect.poll(copyInsideHeader).toBe(true);
    const savedLease = first.getByRole("listitem").filter({ hasText: "Fixture desk lease" });
    const savedBox = (await savedLease.boundingBox())!;
    const fieldBox = (await takenOn.boundingBox())!;
    const headingBox = (await first.locator(".lease-heading").boundingBox())!;
    expect(Math.abs(savedBox.x - fieldBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(savedBox.width - fieldBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(savedBox.y - headingBox.y)).toBeLessThanOrEqual(1);
    for (const access of ["allow-syndication", "deny-syndication"]) {
      await first.getByRole("button", { name: "Add lease", exact: true }).click();
      if (access === "allow-syndication") {
        const accessBox = (await leaseForm.getByLabel("Access").boundingBox())!;
        const valueBox = (await takenOn.boundingBox())!;
        expect(Math.abs(accessBox.x - valueBox.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(accessBox.width - valueBox.width)).toBeLessThanOrEqual(1);
        const headingOffset = await leaseForm.evaluate(form => {
          const top = (element: Element) => {
            const range = document.createRange();
            range.selectNodeContents(element.firstChild!);
            return range.getBoundingClientRect().top;
          };
          return Math.abs(top(form.querySelector("label")!) - top(form.parentElement!.querySelector(".lease-heading")!));
        });
        expect(headingOffset).toBeLessThanOrEqual(1);
      }
      await leaseForm.getByLabel("Access").selectOption(access);
      if (access === "deny-syndication") page.once("dialog", dialog => dialog.accept());
      await leaseForm.getByRole("button", { name: "Save lease" }).click();
      await expect(leaseForm).toHaveCount(0);
    }
    await expect(first.getByRole("button", { name: "Delete Allow syndication lease" })).toHaveCount(0);
    await expect(first.getByText("Fixture desk lease", { exact: true })).toBeVisible();
    await first.getByRole("button", { name: "Delete Deny syndication lease" }).click();
    await first.getByRole("button", { name: "Confirm delete Deny syndication lease" }).click();
    await expect(first.getByRole("button", { name: /delete deny syndication lease/i })).toHaveCount(0);
    await copyLeases.click();
    await expect(page.getByText("Fixture desk lease", { exact: true })).toHaveCount(3);
    await first.getByRole("button", { name: "Delete Allow use lease" }).click();
    await first.getByRole("button", { name: "Confirm delete Allow use lease" }).click();
    await expect(page.getByText("Fixture desk lease", { exact: true })).toHaveCount(2);
    await page.clock.install();
    await clearLeases.click();
    const confirmLeaseClear = first.getByRole("button", { name: "Remove ALL leases from the 2 other images?", exact: true });
    await expect(confirmLeaseClear).toBeVisible();
    await confirmLeaseClear.focus();
    await page.clock.fastForward(5100);
    await expect(confirmLeaseClear).toBeFocused();
    await confirmLeaseClear.press("Escape");
    await expect(clearLeases).toBeFocused();
    await clearLeases.click();
    await expect(page.getByText("Fixture desk lease", { exact: true })).toHaveCount(2);
    await confirmLeaseClear.click();
    await expect(page.getByText("Fixture desk lease", { exact: true })).toHaveCount(0);
    await page.locator('input[type="file"]').setInputFiles({ name: "newer.jpg", mimeType: "image/jpeg", buffer: Buffer.from("U5 newer image") });
    await expect.poll(() => new URL(page.url()).searchParams.get("batch")).not.toBe(batch);
    const newerBatch = new URL(page.url()).searchParams.get("batch")!;
    await expect.poll(async () => Object.keys((await results()).labels).length).toBe(4);
    const laterId = Object.keys((await results()).labels).find(id => !ids.includes(id))!;
    expect((await results()).labels[laterId]).toEqual(["submitted preset"]);
    expect((await (await page.request.get(`${origin}/api/images/${laterId}`)).json()).data.metadata.description).toBe("Embedded caption");
    await page.getByRole("combobox", { name: "Upload batch", exact: true }).selectOption(batch);
    await page.evaluate(async ({ batch, laterId }) => {
      const path = "/src/stores/upload-jobs-store.ts";
      const { useUploadJobsStore } = await import(path) as typeof import("../../src/stores/upload-jobs-store");
      useUploadJobsStore.setState(state => ({ batches: state.batches.map(item => item.id === batch ? { ...item,
        attempts: [...item.attempts, { id: "late-u5", name: "late.jpg", size: 1, phase: "processing", statusId: laterId }],
      } : item) }));
    }, { batch, laterId });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let heldWrite = false;
    const pattern = `**/grid-metadata/metadata/${ids[1]}/metadata`;
    await page.route(pattern, async route => {
      if (route.request().method() === "PUT") { heldWrite = true; await held; }
      await route.continue();
    });
    const beforeArrow = (await results()).metadataWrites.length;
    await first.getByLabel("Credit", { exact: true }).fill("Shared batch credit");
    try {
      await first.getByRole("button", { name: "Apply Credit to 2 other images", exact: true }).click();
      await expect.poll(() => heldWrite).toBe(true);
      await page.getByRole("combobox", { name: "Upload batch", exact: true }).selectOption(newerBatch);
      await page.evaluate(async ({ batch, laterId }) => {
        const path = "/src/stores/upload-jobs-store.ts";
        const { useUploadJobsStore } = await import(path) as typeof import("../../src/stores/upload-jobs-store");
        useUploadJobsStore.setState(state => ({ batches: state.batches.map(item => item.id === batch ? { ...item,
          attempts: item.attempts.map(attempt => attempt.id === "late-u5" ? { ...attempt, phase: "complete", imageId: laterId } : attempt),
        } : item) }));
      }, { batch, laterId });
      await page.getByRole("combobox", { name: "Upload batch", exact: true }).selectOption(batch);
      const creditField = first.locator('[data-measured-field="metadata_credit"]');
      const progress = creditField.getByRole("button", { name: "Applying Credit to 2 other images", exact: true });
      await expect(progress.locator("circle")).toBeVisible();
      await expect(creditField.getByText(/Saving: \d\/2 visible/)).toHaveCount(0);
      await progress.click();
      await expect(creditField.getByRole("button", { name: "Stop batch save", exact: true })).toHaveCount(0);
      await expect(creditField.getByText(/Saving: \d\/2 visible/)).toBeVisible();
    } finally { release(); await page.unroute(pattern); }
    await expect.poll(async () => Object.values((await results()).metadata).filter(value => value.credit === "Shared batch credit").length).toBe(3);
    expect((await results()).metadataWrites.slice(beforeArrow).filter(write => write.method === "PUT").map(write => write.id).sort()).toEqual([...ids].sort());
    expect((await results()).metadataWrites.filter(write => write.id === laterId).map(write => write.method)).toEqual(["POST"]);
    expect((await results()).metadataReads[laterId]).toBe(1);
    expect(Object.values((await results()).metadata).every(value => JSON.stringify(value.domainMetadata) === JSON.stringify({ desk: { reference: "retained" } }))).toBe(true);
    const rightsGeometry = () => first.getByRole("form", { name: "Image usage rights" }).evaluate(form => {
      const top = form.getBoundingClientRect().top;
      return [...form.querySelectorAll('[aria-label="Rights category"], [aria-label="Creator"], .rights-actions')].map(element => {
        const { y, width, height } = element.getBoundingClientRect();
        return [y - top, width, height];
      });
    });
    const editRights = async (category: string, creator: string) => {
      if (category !== "publisher-illustration") await first.getByRole("button", { name: "Edit Rights & restrictions" }).click();
      const rights = first.getByRole("form", { name: "Image usage rights" });
      if (category === "publisher-illustration") await expect(rights.getByLabel("Rights category")).toHaveValue("");
      await rights.getByLabel("Rights category").selectOption(category);
      if (category === "publisher-illustration") {
        await rights.getByRole("radio", { name: "Weekly" }).check();
        const input = rights.getByRole("combobox", { name: "Creator" });
        await rights.getByRole("button", { name: "Show all options" }).click();
        await expect(rights.getByRole("option", { name: "Weekly artist" })).toBeVisible();
        await input.press("ArrowUp"); await input.press("Enter");
        await expect(input).toHaveValue("Other artist");
        await input.fill("KLY");
        await expect(rights.getByRole("listbox").getByRole("option")).toHaveText(["Weekly artist"]);
        const allOptions = rights.getByRole("button", { name: "Show all options" });
        await allOptions.click();
        await expect(rights.getByRole("listbox").getByRole("option")).toHaveText(["Weekly artist", "Other artist"]);
        await expect(input).toHaveValue("KLY");
        await input.dispatchEvent("keydown", { key: "Escape", isComposing: true });
        await expect(input).toHaveValue("KLY");
        await input.press("Escape");
        await expect(rights.getByRole("listbox")).toHaveCount(0);
      }
      if (creator) await rights.getByLabel("Creator").fill(creator);
      const before = category === "publisher-illustration" ? await rightsGeometry() : undefined;
      await rights.getByRole("button", { name: "Save", exact: true }).click();
      return before;
    };
    const derivedPath = `**/metadata/${ids[0]}/metadata/set-from-usage-rights`;
    let releaseDerived!: () => void;
    const heldDerived = new Promise<void>(done => { releaseDerived = done; });
    await page.route(derivedPath, async route => { await heldDerived; await route.continue(); });
    try {
      const dispatched = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(`/metadata/${ids[0]}/metadata/set-from-usage-rights`));
      const before = await editRights("publisher-illustration", "Unlisted illustrator");
      await dispatched;
      await expect(first.getByRole("status", { name: "Saving rights" })).toBeVisible();
      expect(await rightsGeometry()).toEqual(before);
      for (const field of ["Byline", "Credit"]) await expect(first.getByRole("button", { name: `Saving ${field}`, exact: true })).toBeVisible();
      await expect(first.getByRole("button", { name: "Saving Description", exact: true })).toHaveCount(0);
      await creditInput.fill("Temporary credit");
      await creditInput.fill("Shared batch credit");
      await (await getDensityChangeButton(page, "grid"))?.click();
      await expect(form).toHaveCount(0);
      await (await getDensityChangeButton(page, "form"))?.click();
      const restoredRights = first.getByRole("form", { name: "Image usage rights" });
      await expect(restoredRights).toHaveAttribute("data-field-state", "Saving…");
      await expect(restoredRights.getByRole("status", { name: "Saving rights" }).locator("svg")).toBeVisible();
      await expect(restoredRights.getByText("Saving…", { exact: true })).toHaveCount(0);
      await expect(restoredRights.getByLabel("Creator")).toHaveValue("Unlisted illustrator");
      await expect(restoredRights.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await (await getDensityChangeButton(page, "grid"))?.click();
    } finally { releaseDerived(); await page.unroute(derivedPath); }
    await expect.poll(async () => (await results()).metadata[ids[0]].byline).toBe("Unlisted illustrator");
    await expect.poll(() => page.evaluate(async id => {
      const path = "/src/stores/metadata-drafts-store.ts";
      return (await import(path)).useMetadataDrafts.getState().drafts.get(id)?.has("usageRights_category") ?? false;
    }, ids[0])).toBe(false);
    await (await getDensityChangeButton(page, "form"))?.click();
    await expect(first.getByLabel("Byline", { exact: true })).toHaveValue("Unlisted illustrator");
    await expect.poll(async () => (await results()).metadata[ids[0]].credit).toBe("Shared batch credit");
    await page.route(derivedPath, route => route.fulfill({ status: 403, json: {} }));
    try {
      await editRights("publisher-photography", "Unlisted photographer");
      await expect(first.getByText(/Metadata from rights: 1 not saved/)).toBeVisible();
      await expect(first.getByLabel("Byline", { exact: true })).toHaveValue("Unlisted illustrator");
    } finally { await page.unroute(derivedPath); }
    await editRights("pay-to-use", "");
    const status = first.getByRole("group", { name: "Image status" });
    await expect(status.getByText("Pay to use", { exact: true })).toBeVisible();
    await expect(status.getByRole("button", { name: "Unusable" })).toHaveAttribute("title", "Fixture paid-image notice");
    await expect(status.getByRole("button", { name: "Unusable" }).locator("svg")).toHaveAttribute("fill", "white");
    expect((await status.boundingBox())!.height).toBeLessThanOrEqual(24);
    const archivePath = "**/grid-metadata/metadata/*/archived";
    const addToLibrary = status.getByRole("button", { name: "Add to Library" });
    await expect(addToLibrary.locator('[data-library-icon="add"]')).toBeVisible();
    const stripGeometry = () => status.evaluate(element => Array.from(element.children, child => {
      const { x, width, height } = child.getBoundingClientRect();
      return [x, width, height];
    }));
    const beforeLibrarySave = await stripGeometry();
    let releaseArchive!: () => void;
    const archiveHeld = new Promise<void>(done => { releaseArchive = done; });
    await page.route(archivePath, async route => { await archiveHeld; await route.continue(); }, { times: 1 });
    try {
      await Promise.all([page.waitForRequest(archivePath), addToLibrary.click()]);
      await expect(addToLibrary).toBeDisabled();
      await expect(addToLibrary.locator('[data-library-icon="add"]')).toBeVisible();
      expect(await stripGeometry()).toEqual(beforeLibrarySave);
    } finally { releaseArchive(); }
    const removeFromLibrary = status.getByRole("button", { name: "Remove from Library" });
    await expect(removeFromLibrary).toBeEnabled();
    expect(await stripGeometry()).toEqual(beforeLibrarySave);
    const freeStatus = form.getByRole("group", { name: "Image status" }).filter({ hasText: "Free to use" }).first();
    for (const label of [freeStatus.getByTitle("Free to use", { exact: true }), freeStatus.getByRole("button", { name: "View image" })]) {
      await expect(label).toHaveCSS("background-color", "rgb(0, 128, 0)");
      await expect(label).toHaveCSS("font-size", "14px");
      await expect(label).toHaveCSS("font-weight", "400");
    }
    await status.getByRole("button", { name: "Unusable" }).hover();
    const addedIcon = removeFromLibrary.locator('[data-library-icon="added"]');
    const removeIcon = removeFromLibrary.locator('[data-library-icon="remove"]');
    await expect(addedIcon).toBeVisible();
    await expect(removeIcon).toBeHidden();
    await removeFromLibrary.hover();
    await expect(removeIcon).toBeVisible();
    await expect(addedIcon).toBeHidden();
    await status.getByRole("button", { name: "Unusable" }).hover();
    await status.getByRole("button", { name: "Unusable" }).focus();
    await page.keyboard.press("Tab");
    await expect(removeFromLibrary).toBeFocused();
    await expect(removeIcon).toBeVisible();
    const archiveRequests: string[] = [];
    await page.route(archivePath, route => {
      archiveRequests.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ status: 403, json: {} });
    });
    try {
      await removeFromLibrary.click();
      await expect(status.getByText("Not saved", { exact: true })).toBeVisible();
      expect(archiveRequests).toEqual([`PUT /grid-metadata/metadata/${ids[0]}/archived`]);
    } finally { await page.unroute(archivePath); }
    await expect(first.getByText("Fixture paid-image notice", { exact: true })).toHaveCount(0);
    await status.getByRole("button", { name: "Unusable" }).click();
    await expect(page.locator(`[data-detail-image-id="${ids[0]}"]`).getByText("Fixture paid-image notice", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to uploads", exact: true }).click();
    await first.getByRole("button", { name: "Add person", exact: true }).click();
    await first.getByRole("textbox", { name: "New person", exact: true }).fill("Illustrator, Jr.");
    await first.getByRole("button", { name: "Commit new person" }).click();
    await expect(first.getByText("Illustrator, Jr.", { exact: true })).toBeVisible();
    await fieldArrow("people").click();
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/images/${ids[1]}`)).json()).data.metadata.peopleInImage).toEqual(["Illustrator, Jr."]);
    await expect(fieldArrow("people")).toHaveAttribute("title", /^Add people to /);
    const peer = form.locator(`[data-measured-cell][data-image-id="${ids[1]}"]`);
    for (const [card, noun, value] of [[peer, "keyword", "Peer only"], [first, "keyword", "Source keyword"], [first, "label", "Batch label"]] as const) {
      await card.getByRole("button", { name: `Add ${noun}`, exact: true }).click();
      await card.getByLabel(`New ${noun}`, { exact: true }).fill(noun === "label" ? `${value}, Finals, ${value}` : value);
      await card.getByRole("button", { name: `Commit new ${noun}` }).click();
      await expect(card.getByRole("button", { name: `Remove ${value}`, exact: true })).toBeVisible();
    }
    await fieldArrow("labels").click();
    await expect.poll(async () => (await results()).labels[ids[1]]).toEqual(["submitted preset", "Batch label", "Finals"]);
    await expect(fieldArrow("labels")).toHaveAttribute("title", /^Add labels to /);
    await first.getByRole("button", { name: "Remove submitted preset", exact: true }).click();
    await expect(fieldArrow("labels")).toHaveAttribute("title", /also removes “submitted preset”/);
    await fieldArrow("labels").click();
    await expect.poll(async () => (await results()).labels[ids[1]]).toEqual(["Batch label", "Finals"]);
    const peerMetadata = async () => (await (await page.request.get(`${origin}/api/images/${ids[1]}`)).json()).data.metadata;
    await fieldArrow("keywords").click();
    await expect.poll(async () => (await peerMetadata()).keywords).toEqual(["Peer only", "Source keyword"]);
    await expect(fieldArrow("keywords")).toHaveAttribute("title", /^Add keywords to /);
    await first.getByRole("button", { name: "Add keyword", exact: true }).click();
    await first.getByLabel("New keyword", { exact: true }).fill("Football");
    await first.getByRole("button", { name: "Commit new keyword" }).click();
    await expect(first.getByRole("button", { name: "Remove Football", exact: true })).toBeVisible();
    await first.getByRole("button", { name: "Remove Source keyword", exact: true }).click();
    await expect(fieldArrow("keywords")).toHaveAttribute("title", /also removes “Source keyword”/);
    await fieldArrow("keywords").click();
    await expect.poll(async () => (await peerMetadata()).keywords).toEqual(["Peer only", "Football"]);
    await expect(fieldArrow("keywords")).toHaveAttribute("title", /^Add keywords to /);
    await first.getByRole("button", { name: "Choose subjects" }).click();
    await first.getByRole("checkbox", { name: "news", exact: true }).check();
    await first.getByRole("button", { name: "Commit subject changes" }).click();
    await expect(first.getByRole("button", { name: "Remove news", exact: true })).toBeEnabled();
    await fieldArrow("subjects").click();
    await expect.poll(async () => (await peerMetadata()).subjects).toEqual(["news"]);
    await first.getByRole("button", { name: "Choose subjects" }).click();
    await first.getByRole("checkbox", { name: "news", exact: true }).uncheck();
    await first.getByRole("checkbox", { name: "sport", exact: true }).check();
    await expect(first.getByRole("button", { name: "Remove news", exact: true })).toBeEnabled();
    await first.getByRole("button", { name: "Commit subject changes" }).click();
    await expect(fieldArrow("subjects")).toHaveAttribute("title", /also removes “news”/);
    await fieldArrow("subjects").click();
    await expect.poll(async () => (await peerMetadata()).subjects).toEqual(["sport"]);
    await first.getByRole("button", { name: "Remove Finals", exact: true }).click();
    await expect(first.getByRole("button", { name: "Remove Finals", exact: true })).toHaveCount(0);
    for (const [field, value, property] of [["keywords", "Football", "keywords"], ["people", "Illustrator, Jr.", "peopleInImage"], ["labels", "Batch label", "labels"], ["subjects", "sport", "subjects"]]) {
      await first.getByRole("button", { name: `Remove ${value}`, exact: true }).click();
      await expect(fieldArrow(field)).toHaveAttribute("title", /^Clear /);
      await fieldArrow(field).click();
      if (field === "keywords") {
        const confirmation = first.getByRole("group", { name: /^Remove ALL keywords/ });
        await confirmation.getByRole("button").press("Escape");
        await expect(confirmation).toHaveCount(0);
        await expect(fieldArrow(field)).toBeFocused();
        expect((await peerMetadata()).keywords).toContain(value);
        await fieldArrow(field).click();
      }
      await first.getByRole("button", { name: new RegExp(`Remove ALL ${field} from the .* other images`) }).click();
      await expect.poll(async () => field === "labels" ? (await results()).labels[ids[1]] : (await peerMetadata())[property]).toEqual([]);
      await expect(fieldArrow(field)).toHaveAttribute("title", /^Clear /);
    }
    await first.getByRole("button", { name: "Add lease", exact: true }).click();
    await leaseForm.getByLabel("Access").selectOption("allow-use");
    await leaseForm.getByRole("button", { name: "Save lease" }).click();
    await expect(first.getByRole("button", { name: "Delete Allow use lease" })).toBeEnabled();
    await (await getDensityChangeButton(page, "grid"))?.click();
    const paidBadge = page.locator(`[data-image-id="${ids[0]}"]`).getByText("£", { exact: true }).first();
    await expect(paidBadge).toBeVisible();
    await expect(paidBadge).toHaveAttribute("title", /^Leased, but:/);
    await (await getDensityChangeButton(page, "table"))?.click();
    await page.getByRole("region", { name: "Image results table", exact: true }).locator(`[data-image-id="${ids[0]}"]`).dblclick();
    await expect(page.getByText("Fixture paid-image notice")).toBeVisible();
    await page.getByRole("button", { name: "Crop image", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Crop image", exact: true }).getByText("Pay to use", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to image", exact: true }).click();
    await page.getByRole("button", { name: "Edit Description", exact: true }).click();
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("Details saved description");
    await page.getByRole("button", { name: "Commit Description", exact: true }).click();
    await expect.poll(async () => (await results()).metadata[ids[0]].description).toBe("Details saved description");
    await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Description", exact: true })).toBeEnabled();
    await expect(page.getByRole("complementary", { name: "Image activity" })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit Description", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Details saved description");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("");
    await page.getByRole("button", { name: "Commit Description", exact: true }).click();
    await expect.poll(async () => (await (await page.request.get(`${origin}/api/images/${ids[0]}`)).json()).data.metadata.description).toBe("");
    await expect(page.getByRole("button", { name: /Apply .* other images/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Description", exact: true })).toBeEnabled();
    const rejectWrite = `**/metadata/${ids[0]}/metadata`;
    let settle!: () => void;
    const heldFailure = new Promise<void>(resolve => { settle = resolve; });
    await page.route(rejectWrite, async route => {
      if (route.request().method() !== "PUT") return route.fallback();
      await heldFailure; await route.fulfill({ status: 422, json: {} });
    });
    try {
      await page.getByRole("button", { name: "Edit Description", exact: true }).click();
      await page.getByRole("textbox", { name: "Description", exact: true }).fill("Rejected description");
      const dispatched = page.waitForRequest(req => req.method() === "PUT" && new URL(req.url()).pathname.endsWith(`/metadata/${ids[0]}/metadata`));
      await page.getByRole("button", { name: "Commit Description", exact: true }).click();
      await dispatched;
      const detail = page.locator(`[data-detail-image-id="${ids[0]}"]`);
      const issue = detail.getByRole("button", { name: "1 issue", exact: true });
      await expect(issue).toHaveCount(0);
      settle();
      await expect(issue).toBeVisible();
      expect(await issue.evaluate(button => Boolean(button.closest("header.detail-toolbar")))).toBe(true);
      await issue.click();
      await expect(detail.locator(":popover-open")).toHaveText("Description: 1 not saved");
      await page.keyboard.press("Escape");
    } finally { settle(); await page.unroute(rejectWrite); }
    await page.getByRole("button", { name: "Back to uploads", exact: true }).click();
    expect(new URL(page.url()).searchParams.get("batch")).toBe(batch);
  });

  test("U4.5 combines one batch with all other uploads and preserves section inspection origins", async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => localStorage.setItem("kupua-allow-uploads", "true"));
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, multiple: true, status: "COMPLETED", visible: true, searchable: true } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 1650 } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    await (await getDensityChangeButton(page, "table"))?.click();
    await page.getByRole("button", { name: "My recent uploads", exact: true }).click();
    await expect(page.getByRole("region", { name: "Image results form", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await expect(page.getByRole("region", { name: "Image results table", exact: true })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles([{ name: "older.jpg", mimeType: "image/jpeg", buffer: Buffer.from("older upload") }]);
    const older = new URL(page.url()).searchParams.get("batch")!;
    await expect(page.getByRole("region", { name: "Image results form", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload activity: 1 completed", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().uploadSections?.batch)).toBe(1);
    const olderId = await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().results.find(Boolean)!.id);
    await page.goBack();
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/upload");
    expect(new URL(page.url()).searchParams.get("batch")).toBeNull();
    await page.goForward();
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get("batch")).toBe(older);
    await page.locator('input[type="file"]').setInputFiles([{ name: "newer.jpg", mimeType: "image/jpeg", buffer: Buffer.from("newer upload") }]);
    const newer = new URL(page.url()).searchParams.get("batch")!;
    expect(newer).not.toBe(older);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().uploadSections)).toMatchObject({ batch: 1, other: 1651 });
    const form = page.getByRole("region", { name: "Image results form", exact: true });
    const firstThumb = form.getByRole("button", { name: "Open image", exact: true }).first();
    const returnId = await firstThumb.getAttribute("data-cell-id");
    await firstThumb.click();
    await page.getByRole("button", { name: "Back to uploads", exact: true }).click();
    const returned = form.locator(`[data-cell-id="${returnId}"]`);
    await expect(returned).toHaveClass(/anim-focus-here-unfocused/);
    expect(await returned.evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("kupua-form-return");
    await expect(returned).not.toHaveClass(/ring-grid-accent/);
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBe(returnId);
    await page.keyboard.press("PageDown");
    await expect(form.locator(`[data-cell-id="${olderId}"]`)).toBeInViewport();
    await page.keyboard.press("PageUp");
    await expect(returned).toBeInViewport();
    const track = page.getByTestId("scrubber-track");
    const trackBox = (await track.boundingBox())!;
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().positionMap?.length)).toBe(1652);
    const profiles: string[] = [];
    page.on("request", request => { if (request.url().endsWith("/images/sort-profile")) profiles.push(request.postDataJSON()?.operation); });
    await page.mouse.move(trackBox.x + 2, trackBox.y + trackBox.height * .85);
    await expect(track.locator("[data-sort-label]")).toHaveText("My other uploads");
    const positionLabel = track.locator("[data-position-label]");
    await expect(positionLabel).toHaveText(/of 1,651\s+\d+ (October|November) 2026/);
    const [position, date] = (await positionLabel.innerText()).split("\n");
    const local = Number(position.split(" of ")[0].replaceAll(",", "")) - 1;
    const mapped = await page.evaluate(local => {
      const state = (window as CommandWindow).__kupua_store__.getState(), index = local + state.uploadSections!.batch;
      return { outside: !state.results[index - state.bufferOffset], timestamp: state.positionMap!.sortValues[index][1] };
    }, local);
    expect(mapped.outside).toBe(true);
    expect(date).toBe(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone) }).format(Number(mapped.timestamp)));
    expect(await track.locator("[data-debug-tick-position]").count()).toBeGreaterThan(0);
    expect(profiles).toEqual([]);
    await (await getDensityChangeButton(page, "table"))?.click();
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await expect(table.locator('[data-upload-section="batch"]')).toHaveCount(0);
    await expect(table.locator('[data-upload-section="other"]')).toBeVisible();
    const uploaded = table.getByRole("columnheader", { name: /^Uploaded Resize/ });
    await expect(uploaded).toHaveAttribute("aria-sort", "none");
    await uploaded.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("orderBy")).toBe("-uploadTime");
    const newerId = await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().results.find(Boolean)!.id);
    expect(newerId).not.toBe(olderId);
    await expect(table.locator(`[data-image-id="${olderId}"]`)).toBeVisible();
    await table.locator(`[data-image-id="${newerId}"]`).dblclick();
    await expect(page.getByRole("button", { name: "Back to uploads", exact: true })).toBeVisible();
    await expect(page.locator('[data-inspection-section="batch"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Next image", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to uploads", exact: true }).click();
    await table.locator(`[data-image-id="${olderId}"]`).dblclick();
    await expect(page.locator('[data-inspection-section="other"]')).toBeVisible();
    expect(new URL(page.url()).searchParams.get("section")).toBe("other");
    await page.reload();
    await expect(page.locator(`[data-detail-image-id="${olderId}"]`)).toBeVisible();
    await page.getByRole("button", { name: "Back to uploads", exact: true }).click();
    await new KupuaHelpers(page).seekTo(0.75);
    await expect.poll(() => page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return state.results.some(image => image && /^local-\d+$/.test(image.id) && Number(image.id.slice(6)) > 300);
    })).toBe(true);
    await table.evaluate(element => { element.scrollTop = 0; });
    await page.getByRole("button", { name: "View all your uploads", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/search");
    expect(new URL(page.url()).searchParams.get("uploadedBy")).toBe("uploader@example.invalid");
    expect(new URL(page.url()).searchParams.get("batch")).toBeNull();
    await page.getByRole("button", { name: "My recent uploads", exact: true }).click();
    await expect(page.getByRole("region", { name: "Image results form", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("batch")).toBe(newer);
    expect(new URL(page.url()).searchParams.get("image")).toBeNull();
    await (await getDensityChangeButton(page, "table"))?.click();
    await page.reload();
    await expect(page.getByRole("region", { name: "Image results table", exact: true })).toBeVisible();
    await page.goto(`${origin}/upload`);
    await expect(page.getByRole("region", { name: "Image results form", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("batch")).toBe(newer);
    await page.goto(`${origin}/upload?image=local-0`);
    await expect(page.locator('[data-detail-image-id="local-0"]')).toBeVisible();
    await page.getByRole("button", { name: "Back to uploads", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("image")).toBeNull();
    expect(new URL(page.url()).searchParams.get("batch")).toBeNull();
    await page.goForward();
    await expect(page.locator('[data-detail-image-id="local-0"]')).toBeVisible();
  });

  test("U4.5 keeps a distant lower Form field stable when the final member of a 250-member batch arrives", async ({ page }) => {
    test.setTimeout(120_000);
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => localStorage.setItem("kupua-allow-uploads", "true"));
    const members = Array.from({ length: 249 }, (_, index) => ({
      id: (index + 1).toString(16).padStart(40, "0"), name: `${String(index).padStart(3, "0")}.jpg`,
    }));
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, multiple: true, status: "COMPLETED", visible: true, searchable: true, members } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 9_000_000 } });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let transferHeld = false;
    const transferPattern = "**/grid-loader/images?*";
    await page.route(transferPattern, async route => {
      if (new URL(route.request().url()).searchParams.get("filename") === "249.jpg") {
        transferHeld = true;
        await held;
      }
      await route.continue();
    });
    try {
      await page.goto(`${origin}/__continuation?density=table`);
      await new KupuaHelpers(page).waitForResults();
      await page.locator('input[type="file"]').setInputFiles({
        name: "249.jpg", mimeType: "image/jpeg", buffer: Buffer.from("representative upload 249"),
      });
      await expect.poll(() => transferHeld).toBe(true);
      await expect.poll(() => new URL(page.url()).searchParams.get("batch")).toMatch(/^local-/);
      await page.evaluate(async members => {
        const jobsPath = "/src/stores/upload-jobs-store.ts";
        const { useUploadJobsStore } = await import(jobsPath) as typeof import("../../src/stores/upload-jobs-store");
        const batchId = new URL(location.href).searchParams.get("batch");
        useUploadJobsStore.setState(state => ({
          batches: state.batches.map(batch => batch.id === batchId ? { ...batch, attempts: [
            ...members.map(member => ({ id: `seed-${member.id}`, name: member.name, size: 1, phase: "complete" as const, imageId: member.id })),
            ...batch.attempts,
          ] } : batch),
          activityAttemptIds: new Set([...state.activityAttemptIds, ...members.map(member => `seed-${member.id}`)]),
        }));
      }, members);
      await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().uploadSections?.batch), { timeout: 60_000 }).toBe(249);
      const profileOps: string[] = [];
      await page.route("**/api/images/sort-profile", async route => {
        const body = route.request().postDataJSON();
        if (!["date-stats", "date-buckets"].includes(body.operation)) return route.fallback();
        expect(body).toMatchObject({ uploadedBy: "uploader@example.invalid", field: "uploadTime", orderBy: "-uploadTime" });
        expect(body.q).toContain(`-id:"${members[0].id}"`);
        profileOps.push(body.operation);
        if (body.operation === "date-buckets") expect(body.interval).toBe("month");
        await route.fulfill({ json: body.operation === "date-stats" ? { min: Date.UTC(2023, 6, 1), max: Date.UTC(2026, 10, 1), valueCount: 9_000_000 }
          : { evidenceCount: 9_000_000, positionKind: "exact-rank", buckets: [
            { key: "2026-11-01T00:00:00Z", startPosition: 0, count: 4_000_000 },
            { key: "2026-07-01T00:00:00Z", startPosition: 4_000_000, count: 5_000_000 }] } });
      });
      const track = page.getByTestId("scrubber-track"), bounds = (await track.boundingBox())!;
      await page.mouse.move(bounds.x + 2, bounds.y + bounds.height * .75);
      await expect(track.locator('[data-debug-tick-position="4000249"]')).toHaveCount(1);
      await expect(track.locator("[data-position-label]")).toHaveText(/\nJuly 2026 UTC$/);
      expect(profileOps).toEqual(["date-stats", "date-buckets"]);
      await page.mouse.move(bounds.x - 40, bounds.y);
      await page.evaluate(async () => { await (window as CommandWindow).__kupua_store__.getState().seek(500_249); });
      const form = page.getByRole("region", { name: "Image results form", exact: true });
      const input = form.locator('[data-measured-cell][data-image-id="local-500000"]').getByRole("textbox", { name: "Description", exact: true });
      await input.fill("A lower-section draft that remains in place.");
      await input.focus();
      await input.evaluate(element => (element as HTMLTextAreaElement).setSelectionRange(4, 10));
      const original = await input.evaluateHandle(element => element);
      const top = await input.evaluate(element => element.getBoundingClientRect().top);
      const composition = await page.context().newCDPSession(page);
      let composing = false;
      try {
        await composition.send("Input.imeSetComposition", { text: "typing", selectionStart: 1, selectionEnd: 3 });
        composing = true;
        const value = await input.inputValue();
        release();
        await expect.poll(() => page.evaluate(() => {
          const state = (window as CommandWindow).__kupua_store__.getState();
          return !state.loading && state.uploadSections?.batch;
        })).toBe(250);
        expect(await input.evaluate((element, original) => element === original, original)).toBe(true);
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(value);
        expect(await input.evaluate(element => [(element as HTMLTextAreaElement).selectionStart, (element as HTMLTextAreaElement).selectionEnd])).toEqual([5, 7]);
        expect(Math.abs(await input.evaluate(element => element.getBoundingClientRect().top) - top)).toBeLessThan(1);
        await composition.send("Input.insertText", { text: "typing" });
        composing = false;
        expect(await page.evaluate(async () => {
          const tuningPath = "/src/constants/tuning.ts";
          const { BUFFER_CAPACITY } = await import(tuningPath);
          const state = (window as CommandWindow).__kupua_store__.getState();
          return state.results.length <= BUFFER_CAPACITY && state.bufferOffset > 400_000;
        })).toBe(true);
        await expect(page.getByTestId("result-summary")).toHaveCount(0);
        for (const density of ["grid", "table", "justified", "form"] as const) await (await getDensityChangeButton(page, density))?.click();
        await expect(input).toHaveValue(value);
        expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(1);
      } finally {
        if (composing) await composition.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
        await composition.detach();
        await original.dispose();
      }
    } finally {
      release();
      await page.unroute(transferPattern);
      await page.evaluate(async () => {
        const jobsPath = "/src/stores/upload-jobs-store.ts";
        (await import(jobsPath)).disposeUploadJobs();
      });
      await page.goto("about:blank");
    }
  });

  test("U4 Search picker and drops create distinct batches while internal image drags create no upload", async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => { localStorage.setItem("kupua-allow-uploads", "true"); localStorage.removeItem("kupua-allow-editing");
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    });
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, multiple: true, status: "COMPLETED", visible: true, searchable: true } });
    await page.goto(`${origin}/__continuation?density=grid`);
    await new KupuaHelpers(page).waitForResults();
    await page.getByRole("button", { name: /^Sort by:/ }).click();
    for (const name of ["Last used", "Added to collection", "Uploader"]) {
      await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "My recent uploads", exact: true }).click();
    await expect(page.getByRole("toolbar", { name: "Navigation", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Current batch", exact: true })
      .getByRole("combobox", { name: "Upload batch", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    expect(await page.locator('input[type="file"][multiple]').count()).toBe(1);
    await page.locator('input[type="file"]').setInputFiles([
      { name: "z.jpg", mimeType: "image/jpeg", buffer: Buffer.from("first fixture") },
      { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("second fixture") },
    ]);
    await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(2);
    const results = page.locator('[role="region"][aria-label^="Image results "]');
    await expect.poll(() => results.evaluate(element => element.scrollTop)).toBe(0);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().uploadSections?.batch)).toBe(2);
    await expect.poll(() => results.evaluate(element => element.scrollTop)).toBe(0);
    const first = new URL(page.url()).searchParams.get("batch");
    expect(first).toMatch(/^local-/);
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await new KupuaHelpers(page).waitForResults();
    const drop = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["third fixture"], "next.jpg", { type: "image/jpeg" }));
      return transfer;
    });
    const statusPattern = "**/grid-loader/uploadStatus/**";
    let releaseProcessing!: () => void;
    const processing = new Promise<void>(resolve => { releaseProcessing = resolve; });
    try {
      await page.locator("[data-upload-dropzone]").dispatchEvent("drop", { dataTransfer: drop });
      await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(3);
      const second = new URL(page.url()).searchParams.get("batch");
      expect(second).toMatch(/^local-/);
      expect(second).not.toBe(first);
      await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().uploadSections?.batch)).toBe(1);
      await page.getByRole("button", { name: "Sort by: Filename", exact: true }).click();
      await page.getByRole("option", { name: "Uploaded", exact: true }).click();
      await expect.poll(() => page.evaluate(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return { orderBy: state.params.orderBy, loading: state.loading,
          pendingPlacement: state._searchContinuity?.phase === "pending" || state._searchContinuity?.phase === "ready" };
      })).toEqual({ orderBy: "-uploadTime", loading: false, pendingPlacement: false });
      await page.request.post(`${origin}/__upload-control`, { data: { status: "QUEUED", visible: false, searchable: false } });
      await page.route(statusPattern, async route => { await processing; await route.continue(); });
      await results.hover();
      await page.mouse.wheel(0, 1500);
      await expect.poll(() => results.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await expect.poll(() => results.evaluate(element => {
        const viewport = element.getBoundingClientRect();
        const input = Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
          .find(input => { const bounds = input.getBoundingClientRect(); return bounds.bottom > viewport.top && bounds.top < viewport.bottom; });
        input?.focus({ preventScroll: true });
        return !!input && document.activeElement === input;
      })).toBe(true);
      await page.locator("[data-upload-dropzone]").dispatchEvent("drop", { dataTransfer: drop });
      await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(4);
      expect(new URL(page.url()).searchParams.get("batch")).not.toBe(second);
      expect(new URL(page.url()).searchParams.get("batch")).not.toBe(first);
      await expect(page.getByRole("button", { name: "Sort by: Filename", exact: true })).toBeVisible();
      await expect.poll(() => results.evaluate(element => element.scrollTop)).toBe(0);
      await page.request.post(`${origin}/__upload-control`, { data: { status: "COMPLETED", visible: true, searchable: true } });
      releaseProcessing();
      await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().uploadSections?.batch)).toBe(1);
      await expect.poll(() => results.evaluate(element => element.scrollTop)).toBe(0);
      expect(new URL(page.url()).searchParams.get("orderBy")).toBeNull();
      await page.getByRole("button", { name: "Sort by: Filename", exact: true }).click();
      await page.getByRole("option", { name: "Uploaded", exact: true }).click();
      await page.getByRole("button", { name: "Back to search", exact: true }).click();
      await new KupuaHelpers(page).waitForResults();
      const image = page.locator("[data-image-id]").first();
      await image.dispatchEvent("dragstart", { dataTransfer: drop });
      expect(await drop.evaluate(transfer => transfer.types.includes("application/x-kupua-image-drag"))).toBe(true);
      await page.locator("[data-upload-dropzone]").dispatchEvent("drop", { dataTransfer: drop });
      await image.dispatchEvent("dragend", { dataTransfer: drop });
      expect(new URL(page.url()).pathname).toBe("/search");
      expect(await page.evaluate(async () => {
        const jobsPath = "/src/stores/upload-jobs-store.ts";
        return (await import(jobsPath)).useUploadJobsStore.getState().batches.length;
      })).toBe(3);
      expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(4);
      await page.getByRole("button", { name: "My recent uploads", exact: true }).click();
      await expect(page.getByRole("button", { name: "Sort by: Filename", exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("orderBy")).toBeNull();
    } finally { releaseProcessing(); await page.unroute(statusPattern); await drop.dispose(); }
  });

  test("U4 retained batch URLs survive reload beyond five choices without resuming jobs", async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => { localStorage.setItem("kupua-allow-uploads", "true"); localStorage.removeItem("kupua-allow-editing"); });
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, status: "COMPLETED", visible: true, searchable: true } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    expect(await page.getByRole("combobox", { name: "Upload batch", exact: true }).count()).toBe(0);
    await page.getByRole("button", { name: "My recent uploads", exact: true }).click();
    expect(await page.getByRole("combobox", { name: "Upload batch", exact: true }).count()).toBe(1);
    const ids = await page.evaluate(async () => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      const jobs = await import(jobsPath);
      return Array.from({ length: 7 }, (_, index) => jobs.submitUploadFiles([new File([`synthetic ${index}`], `file-${index}.jpg`)]));
    });
    await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(7);
    await expect.poll(() => page.evaluate(async () => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      return (await import(jobsPath)).useUploadJobsStore.getState().batches.every((batch: any) => batch.attempts[0].phase === "complete");
    })).toBe(true);
    await expect(page.getByRole("combobox", { name: "Upload batch", exact: true }).locator('option:not([value=""])')).toHaveCount(5);
    await page.getByRole("button", { name: "Earlier batches", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Upload batch", exact: true }).locator('option:not([value=""])')).toHaveCount(7);
    await page.getByRole("combobox", { name: "Upload batch", exact: true }).selectOption(ids[0]!);
    expect(new URL(page.url()).searchParams.get("batch")).toBe(ids[0]);
    await page.goto(`${origin}/upload?batch=${ids[0]}`);
    const selector = page.getByRole("combobox", { name: "Upload batch", exact: true });
    await expect(selector).toHaveValue(ids[0]!);
    await expect(page.locator("[data-image-id]").first()).toBeVisible();
    await page.getByRole("button", { name: "Sort ascending, click to sort descending", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("orderBy")).toBe("-__submittedFilename");
    await page.reload();
    await expect(selector).toHaveValue(ids[0]!);
    await expect(page.getByRole("button", { name: "Sort by: Filename", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true })).toBeEnabled();
    await expect(page.locator("[data-image-id]").first()).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("button", { name: "Sort ascending, click to sort descending", exact: true })).toBeEnabled();
    await page.goForward();
    await expect(page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true })).toBeEnabled();
    expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(7);
    await page.goto(`${origin}/upload?batch=local-missing&image=${"f".repeat(40)}`);
    const missingBatchWarning = page.getByRole("alert").filter({ hasText: "This local batch is unavailable in this tab." });
    await expect(missingBatchWarning).toBeVisible();
    await expect(missingBatchWarning).toHaveAttribute("data-category", "warning");
    await expect(page.getByRole("region", { name: "Current batch", exact: true })
      .getByText("This local batch is unavailable in this tab.", { exact: true })).toHaveCount(0);
    await expect(page.locator("[data-detail-image-id]")).toHaveCount(0);
    expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(7);
  });

  test.describe("compact mixed batches", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("buffered editable detail retains its incoming card layout in either direction", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kupua-allow-editing", "true"));
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, editing: true } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 10 } });
    await page.goto(`${origin}/__readback?density=grid`);
    await page.locator('[data-grid-cell][data-cell-id="local-0"]').tap();
    await page.getByRole("button", { name: "Expand Image details" }).tap();
    const pane = (slot: string) => page.locator(`[data-detail-page="${slot}"]`);
    const geometry = (slot: string) => pane(slot).locator("dl").first().evaluate(list => {
      const bounds = list.getBoundingClientRect();
      return [...list.querySelectorAll("dt, [data-editable-pill]")].map(element => {
        const rect = element.getBoundingClientRect();
        return [rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height].map(value => Math.round(value * 64));
      });
    });
    for (const [slot, key] of [["next", "ArrowRight"], ["previous", "ArrowLeft"]]) {
      await expect(pane(slot).locator('[aria-label="Add lease"]')).toBeDisabled();
      await expect(pane(slot).locator('[data-editable-pill][data-coverage="all"]').first()).toBeAttached();
      const destination = await pane(slot).getAttribute("data-detail-page-id");
      const before = await geometry(slot);
      await page.keyboard.press(key);
      await expect(pane("current")).toHaveAttribute("data-detail-page-id", destination!);
      await expect(pane("current").getByRole("button", { name: "Add lease" })).toBeEnabled();
      expect(await geometry("current")).toEqual(before);
    }
  });

  test("U4 mixed files keep filename order, duplicate outcomes and compact detail return", async ({ page }, testInfo) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => { localStorage.setItem("kupua-allow-uploads", "true"); localStorage.removeItem("kupua-allow-editing"); });
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, multiple: true, maxFileBytes: 20, status: "COMPLETED", visible: true, searchable: true } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 10_000 } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settingsUploads = page.getByRole("group", { name: "Upload controls", exact: true });
    const recentUploads = settingsUploads.getByRole("button", { name: "My recent uploads", exact: true });
    await expect(recentUploads).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Search and filter controls", exact: true })
      .locator(':scope > button[aria-label="My recent uploads"]')).toHaveCount(0);
    await expect(recentUploads.getByText("Uploads", { exact: true })).toBeVisible();
    expect(await settingsUploads.evaluate(element => element.querySelector('[aria-label="My recent uploads"]')!.getBoundingClientRect().right
      <= element.querySelector(".upload-primary")!.getBoundingClientRect().left)).toBe(true);
    expect(await settingsUploads.evaluate(element => Math.abs(element.getBoundingClientRect().right
      - parseFloat(getComputedStyle(element).paddingRight) - element.querySelector(".upload-primary")!.getBoundingClientRect().right))).toBeLessThan(1);
    await page.locator('input[type="file"]').setInputFiles([
      { name: "z-original.jpg", mimeType: "image/jpeg", buffer: Buffer.from("one") },
      { name: "a-first.jpg", mimeType: "image/jpeg", buffer: Buffer.from("two") },
      { name: "m-duplicate.jpg", mimeType: "image/jpeg", buffer: Buffer.from("one") },
      { name: "bad.jpg", mimeType: "image/jpeg", buffer: Buffer.from("unsupported") },
      { name: "oversized.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x".repeat(21)) },
    ]);
    const batch = new URL(page.url()).searchParams.get("batch")!;
    await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(4);
    await expect(page.getByRole("button", { name: "Upload activity: 2 need attention", exact: true })).toBeVisible();
    const activity = page.getByRole("button", { name: "Upload activity: 2 need attention", exact: true });
    expect(await activity.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [bounds.left + 1, bounds.right - 1].every(horizontal =>
        [bounds.top + 1, bounds.bottom - 1].every(vertical =>
          element.contains(document.elementFromPoint(horizontal, vertical))));
    })).toBe(true);
    const prompt = page.getByRole("region", { name: "File upload", exact: true });
    await expect(page.getByRole("toolbar", { name: "Navigation", exact: true })
      .getByRole("button", { name: "Upload files", exact: true })).toBeVisible();
    await expect(prompt.locator(".upload-prompt-message")).toBeHidden();
    await expect(prompt.getByRole("button", { name: "Add label to all uploads", exact: true })).toBeDisabled();
    const uploadControls = page.getByRole("region", { name: "Current batch", exact: true });
    await expect(uploadControls.getByText("Your current batch", { exact: true })).toBeHidden();
    await expect(uploadControls.getByRole("combobox", { name: "Upload batch", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      return (await import(jobsPath)).useUploadJobsStore.getState().batches.at(-1).attempts
        .filter((attempt: any) => ["a-first.jpg", "m-duplicate.jpg", "z-original.jpg"].includes(attempt.name))
        .map((attempt: any) => attempt.phase);
    })).toEqual(["complete", "complete", "complete"]);
    await expect(uploadControls.getByRole("combobox", { name: "Upload batch", exact: true }).locator("option:checked")).toHaveText(/^Today, \d{2}:\d{2} \/ 2 images$/);
    const firstId = "ad782ecdac770fc6eb9a62e44f90873fb97fb26b";
    const secondId = "fe05bcdcdc4928012781a5f1a2a77cbb5398e106";
    for (const density of ["Form", "Justified", "Grid"]) await page.getByRole("button", { name: `${density} view`, exact: true }).click();
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await expect.poll(() => table.locator('[data-image-id]:not([data-image-id^="local-"])').evaluateAll(elements => elements.map(element => element.getAttribute("data-image-id")))).toEqual([firstId, secondId]);
    await expect(page.getByRole("button", { name: "Sort by: Filename", exact: true })).toBeVisible();
    expect(await uploadControls.evaluate(element => [element.querySelector("select")!,
      ...element.querySelectorAll('[aria-label="Batch sort"] button')].map(control => control.getBoundingClientRect().height))).toEqual([32, 32, 32]);
    expect(await uploadControls.evaluate(element => ({
      widthDelta: element.getBoundingClientRect().width - element.closest('[aria-label="Image results table"]')!.clientWidth,
      gap: element.querySelector("select")!.getBoundingClientRect().left - element.querySelector(".upload-section-jump")!.getBoundingClientRect().right,
    }))).toEqual({ widthDelta: 0, gap: 4 });
    await page.getByRole("button", { name: "Sort ascending, click to sort descending", exact: true }).click();
    await expect.poll(() => table.locator('[data-image-id]:not([data-image-id^="local-"])').evaluateAll(elements => elements.map(element => element.getAttribute("data-image-id")))).toEqual([secondId, firstId]);
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    const outcomes = page.locator("[data-upload-attempt]");
    const activityBounds = (await page.getByRole("region", { name: "Upload activity", exact: true }).boundingBox())!;
    expect(activityBounds.x).toBeCloseTo(12, 0);
    expect(activityBounds.width).toBeCloseTo(page.viewportSize()!.width - 24, 0);
    await expect(outcomes.locator("button.upload-filename")).toHaveCount(3);
    expect(await outcomes.locator(".upload-filename").allTextContents()).toEqual(["bad.jpg", "oversized.jpg", "a-first.jpg", "m-duplicate.jpg", "z-original.jpg"]);
    expect(await page.evaluate(async () => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      const attempts = (await import(jobsPath)).useUploadJobsStore.getState().batches.at(-1).attempts;
      return attempts.filter((attempt: any) => ["m-duplicate.jpg", "z-original.jpg"].includes(attempt.name)).map((attempt: any) => attempt.imageId);
    })).toEqual([secondId, secondId]);
    await expect(page.getByText("Filesize exceeds max 20B", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    await page.getByRole("button", { name: "Sort by: Filename", exact: true }).click();
    for (const name of ["Last used", "Added to collection", "Uploader"]) {
      await expect(page.getByRole("option", { name, exact: true })).toHaveCount(0);
    }
    expect(await page.getByRole("listbox", { name: "Sort field", exact: true }).evaluate(menu => {
      const width = menu.getBoundingClientRect().width - 2;
      return [...menu.querySelectorAll('[role="option"]')].every(option => Math.abs(option.getBoundingClientRect().width - width) < 1);
    })).toBe(true);
    await page.getByRole("option", { name: "Uploaded", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sort by: Uploaded", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sort by: Uploaded", exact: true }).click();
    await page.getByRole("option", { name: "Filename", exact: true }).click();
    await expect.poll(() => table.locator('[data-image-id]:not([data-image-id^="local-"])').evaluateAll(elements => elements.map(element => element.getAttribute("data-image-id")))).toEqual([firstId, secondId]);
    await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.getByRole("combobox", { name: "Upload batch", exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(180);
    const allUploads = table.getByRole("button", { name: "View all your uploads", exact: true });
    await expect(allUploads).toBeInViewport({ ratio: 1 });
    await expect(allUploads.locator("svg")).toBeVisible();
    await expect(allUploads.locator("span")).toBeHidden();
    await table.evaluate(element => { element.scrollLeft = 400; });
    await expect(allUploads).toBeInViewport({ ratio: 1 });
    await table.evaluate(element => { element.scrollLeft = 0; });
    await table.evaluate(element => { element.scrollTop = element.querySelector<HTMLElement>(".upload-other-track")!.offsetTop + 100; });
    await expect.poll(() => table.evaluate(element => Math.abs(
      element.querySelector('[data-upload-section="other"]')!.getBoundingClientRect().top
      - element.querySelector(".upload-batch-sticky")!.getBoundingClientRect().bottom))).toBeLessThan(2);
    await expect(page.getByRole("button", { name: "Go to start of current batch", exact: true }))
      .toHaveAttribute("aria-description", "Return to this section");
    await uploadControls.click({ position: { x: 2, y: 2 } });
    await expect.poll(() => table.evaluate(element => element.scrollTop)).toBe(0);
    await expect(page.getByRole("button", { name: "Go to start of current batch", exact: true }))
      .not.toHaveAttribute("aria-description", "Return to this section");
    await page.screenshot({ path: testInfo.outputPath("u4-batch-compact.png") });
    await table.locator(`[data-image-id="${firstId}"]`).tap();
    await expect(page.locator(`[data-detail-image-id="${firstId}"]`)).toBeVisible();
    await expect(page.locator('[data-inspection-section="batch"]')).toHaveText("from batch");
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    await expect(page.getByRole("combobox", { name: "Upload batch", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    await expect(page.getByRole("button", { name: /^(Crop image|Cannot crop)$/ })).toHaveCount(0);
    await page.goBack();
    await expect(table).toBeVisible();
    expect(new URL(page.url()).searchParams.get("batch")).toBe(batch);
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await page.getByRole("toolbar", { name: "Search and filter controls", exact: true })
      .getByRole("button", { name: "Settings", exact: true }).click();
    await expect(recentUploads.getByText("Uploads", { exact: true })).toBeHidden();
    expect(await settingsUploads.evaluate(element => Math.abs(element.getBoundingClientRect().right
      - parseFloat(getComputedStyle(element).paddingRight) - element.querySelector(".upload-primary")!.getBoundingClientRect().right))).toBeLessThan(1);
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    await page.getByRole("region", { name: "Upload activity", exact: true }).getByRole("button", { name: "a-first.jpg", exact: true }).click();
    await expect(page.locator(`[data-detail-image-id="${firstId}"]`)).toBeVisible();
    await page.getByRole("button", { name: "Back to uploads", exact: true }).click();
    await expect(table).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/upload");
    expect(new URL(page.url()).searchParams.get("batch")).toBe(batch);
  });
  });

  test("U4.5 other uploads retain history position across Search and never widen after identity loss", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kupua-allow-uploads", "true"));
    const escaped: string[] = [];
    const consoleMessages: string[] = [];
    page.on("console", message => consoleMessages.push(message.text()));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      escaped.push(new URL(route.request().url()).origin);
      return route.abort();
    });
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 10_000 } });
    const bodies: Record<string, unknown>[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && /\/api\/images\/(search-after|window|count|keys|rank)$/.test(request.url())) bodies.push(request.postDataJSON());
    });
    await page.goto(`${origin}/upload`);
    const kupua = new KupuaHelpers(page);
    await expect(page.getByRole("region", { name: "Image results form", exact: true })).toBeVisible();
    await (await getDensityChangeButton(page, "table"))?.click();
    await kupua.waitForResults();
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await expect(table).toBeVisible();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.every(body => body.uploadedBy === "uploader@example.invalid" && !body.free && body.q === "")).toBe(true);
    expect(consoleMessages.join("\n").includes("uploader@example.invalid")).toBe(false);
    await table.evaluate(element => { element.scrollTop = 650; });
    const point = await kupua.waitForHitTestedImagePoint({ view: "table", topInset: 100 });
    const anchor = await table.locator(`[data-image-id="${point.imageId}"]`).evaluate(element => element.getBoundingClientRect().top);
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await kupua.waitForResults();
    await page.goBack();
    await expect(page.getByRole("combobox", { name: "Upload batch", exact: true })).toHaveValue("");
    await expect.poll(async () => {
      const row = table.locator(`[data-image-id="${point.imageId}"]`);
      return await row.count() ? Math.abs(await row.evaluate(element => element.getBoundingClientRect().top) - anchor) : null;
    }).toBeLessThan(1);
    await expect(page.getByRole("button", { name: "Go to start of current batch", exact: true }))
      .toHaveAttribute("aria-description", "Return to this section");
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await kupua.waitForResults();
    await page.reload();
    await kupua.waitForResults();
    await page.goBack();
    await expect.poll(async () => {
      const row = table.locator(`[data-image-id="${point.imageId}"]`);
      return await row.count() ? Math.abs(await row.evaluate(element => element.getBoundingClientRect().top) - anchor) : null;
    }).toBeLessThan(1);
    await kupua.seekTo(0.55);
    const deep = await kupua.waitForHitTestedImagePoint({ view: "table", topInset: 100 });
    await table.locator(`[data-image-id="${deep.imageId}"]`).click();
    await expect(page.locator(`[data-detail-image-id="${deep.imageId}"]`)).toBeVisible();
    await page.reload();
    await expect(page.locator(`[data-detail-image-id="${deep.imageId}"]`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Next image", exact: true })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.locator("[data-detail-image-id]").getAttribute("data-detail-image-id")).not.toBe(deep.imageId);
    await page.goBack();
    await expect(table).toBeVisible();
    expect(await page.evaluate(() => Object.keys(sessionStorage).map(key => sessionStorage.getItem(key)).join("").includes("uploader@example.invalid"))).toBe(false);
    const previewPoint = await kupua.waitForHitTestedImagePoint({ view: "table", topInset: 100 });
    await page.mouse.click(previewPoint.x, previewPoint.y, { button: "middle" });
    await expect(page.locator('[data-fullscreen-preview="active"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute("data-fullscreen-preview") === true)).toBe(true);
    await page.evaluate(async () => {
      const sessionPath = "/src/lib/grid-api-instance.ts";
      (await import(sessionPath)).invalidateGridSession();
    });
    await expect(page.locator('[data-fullscreen-preview="active"]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(page.getByText("Upload permission is unavailable. Reload after signing in.", { exact: true })).toBeVisible();
    await expect(page.locator("[data-image-id]")).toHaveCount(0);
    await page.request.post(`${origin}/__upload-control`, { data: { identityAvailable: false } });
    bodies.length = 0;
    await page.reload();
    await expect(page.getByText("My other uploads are unavailable. Reload after signing in.", { exact: true })).toBeVisible();
    expect(bodies).toEqual([]);
    expect(escaped).toEqual([]);
  });

  test("U4 interrupted jobs stay idle after reload and quota recovery only retries local storage", async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => { localStorage.setItem("kupua-allow-uploads", "true"); localStorage.removeItem("kupua-allow-editing"); });
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    await page.locator('input[type="file"]').setInputFiles({ name: "pending.jpg", mimeType: "image/jpeg", buffer: Buffer.from("pending") });
    await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(1);
    const acceptUnload = (dialog: Dialog) => dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss();
    page.on("dialog", acceptUnload);
    try { await page.reload(); } finally { page.off("dialog", acceptUnload); }
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    await expect(page.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
    const afterReload = (await (await page.request.get(`${origin}/__upload-control`)).json()).statusReads;
    await page.waitForTimeout(2_200);
    const idle = await (await page.request.get(`${origin}/__upload-control`)).json();
    expect(idle.statusReads).toBe(afterReload);
    expect(idle.writes).toBe(1);
    await page.request.post(`${origin}/__upload-control`, { data: { status: "COMPLETED", visible: true, searchable: true } });
    await page.getByRole("button", { name: "Check again", exact: true }).click();
    await expect(page.getByRole("button", { name: "pending.jpg", exact: true })).toBeVisible();
    const restore = await page.evaluateHandle(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("kupua:uploadBatch:")) throw new DOMException("Synthetic quota", "QuotaExceededError");
        original.call(this, key, value);
      };
      return () => { Storage.prototype.setItem = original; };
    });
    try {
      await page.locator('input[type="file"]').setInputFiles({ name: "quota.jpg", mimeType: "image/jpeg", buffer: Buffer.from("quota") });
      const warning = page.getByText("Upload history saving error", { exact: true });
      await expect(warning).toBeVisible();
      await expect(page.getByRole("button", { name: "Upload activity: 1 completed", exact: true })).toBeVisible();
      await restore.evaluate(restoreStorage => restoreStorage());
      await page.evaluate(async () => {
        const jobsPath = "/src/stores/upload-jobs-store.ts";
        (await import(jobsPath)).retainUploadBatches();
      });
      expect(await page.evaluate(async () => {
        const storagePath = "/src/lib/local-batch-storage.ts";
        return Object.keys((await import(storagePath)).useLocalPersistenceStore.getState().batchIssues);
      })).toEqual([]);
      expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(2);
    } finally { await restore.evaluate(restoreStorage => restoreStorage()); await restore.dispose(); }
  });

  test("U4 compiled-hosted batches use direct services and retain reload and detail history", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const outDir = testInfo.outputPath("hosted-u4");
    const nodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await build({ configFile: resolve("vite.config.ts"), mode: "hosted",
        define: { "import.meta.env.VITE_HOSTED": '"true"', "import.meta.env.VITE_USE_MEDIA_API": '"true"', "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
        build: { outDir, emptyOutDir: true },
      });
    } finally { if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv; }
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, multiple: true } });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
    const appOrigin = "https://app.example.test";
    const apiOrigin = "https://api.example.test";
    const authOrigin = "https://auth.example.test";
    const loaderOrigin = "https://loader.example.test";
    const config = { mediaApiUri: apiOrigin, gridConfig: { upload: { transport: "direct" } } };
    const escaped: string[] = [];
    const cors = { "Access-Control-Allow-Origin": appOrigin, "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
    await page.addInitScript(() => { localStorage.setItem("kupua-allow-uploads", "true"); localStorage.removeItem("kupua-allow-editing"); });
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === appOrigin && ["/", "/search", "/upload"].includes(url.pathname)) {
        const html = (await readFile(resolve(outDir, "index.html"), "utf8")).replace("<head>", `<head><script>window.__KUPUA_CONFIG__=${JSON.stringify(config)}</script>`);
        return route.fulfill({ contentType: "text/html", body: html, headers: {
          "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${apiOrigin} ${authOrigin} ${loaderOrigin}`,
        } });
      }
      if (url.origin === appOrigin && url.pathname.startsWith("/assets/kupua/")) {
        const file = resolve(outDir, url.pathname.slice("/assets/kupua/".length));
        if (!file.startsWith(`${outDir}/`)) return route.abort();
        const contentType = extname(file) === ".css" ? "text/css" : extname(file) === ".wasm" ? "application/wasm" : extname(file) === ".svg" ? "image/svg+xml" : "text/javascript";
        return route.fulfill({ body: await readFile(file), contentType });
      }
      const prefix = url.origin === apiOrigin ? "/api" : url.origin === authOrigin ? "/grid-auth" : url.origin === loaderOrigin ? "/grid-loader" : undefined;
      if (prefix !== undefined || url.origin === appOrigin && url.pathname.startsWith("/__publication-media/")) {
        if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const response = await route.fetch({ url: `${origin}${prefix ?? ""}${url.pathname}${url.search}` });
        return route.fulfill({ response, headers: { ...response.headers(), ...cors } });
      }
      escaped.push(`${url.origin}${url.pathname}`);
      return route.abort();
    });
    await page.goto(`${appOrigin}/search?nonFree=true`);
    await expect(page.locator("[data-image-id]").first()).toBeVisible();
    expect(await page.evaluate(() => "__kupua_store__" in window)).toBe(false);
    await page.getByRole("button", { name: "Table view", exact: true }).click();
    await expect(page.getByRole("button", { name: "Upload files", exact: true })).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles([
      { name: "z.jpg", mimeType: "image/jpeg", buffer: Buffer.from("one") },
      { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("two") },
    ]);
    await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(2);
    const batch = new URL(page.url()).searchParams.get("batch")!;
    await page.request.post(`${origin}/__upload-control`, { data: { status: "COMPLETED", visible: true, searchable: true } });
    await expect(page.getByRole("button", { name: "Upload activity: 2 completed", exact: true })).toBeVisible();
    await (await getDensityChangeButton(page, "table"))?.click();
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await expect(table.locator('[data-image-id]:not([data-image-id^="local-"])')).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Upload batch", exact: true })).toHaveValue(batch);
    await expect(table.locator('[data-image-id]:not([data-image-id^="local-"])')).toHaveCount(2);
    const allUploads = table.getByRole("button", { name: "View all your uploads", exact: true });
    await expect(allUploads).toBeInViewport({ ratio: 1 });
    await expect(allUploads.locator("svg")).toBeVisible();
    await expect(allUploads.locator("span")).toBeVisible();
    const otherHeading = table.locator('[data-upload-section="other"]');
    await expect(otherHeading.getByText(/matches, newest first$/)).toBeVisible();
    expect(await otherHeading.evaluate(section => {
      const heading = section.querySelector("h2")!;
      const count = section.querySelector('[aria-label$=" images"]')!;
      const link = section.querySelector(".upload-other-search")!;
      const headingRect = heading.getBoundingClientRect();
      const countRect = count.getBoundingClientRect();
      return countRect.top >= headingRect.top && countRect.bottom <= headingRect.bottom
        && getComputedStyle(link).fontSize === getComputedStyle(heading).fontSize;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("u4-batch-hosted-desktop.png") });
    await (await getDensityChangeButton(page, "form"))?.click();
    const form = page.getByRole("region", { name: "Image results form", exact: true });
    const draftImage = await form.locator("[data-measured-cell]").first().getAttribute("data-image-id");
    const draftCell = form.locator(`[data-measured-cell][data-image-id="${draftImage}"]`);
    const description = draftCell.getByRole("textbox", { name: "Description", exact: true });
    await description.fill("Retained hosted draft");
    await page.screenshot({ path: testInfo.outputPath("u2-form-hosted-desktop.png") });
    await expect(page.getByRole("button", { name: /^Upload activity:/ })).toHaveCount(0);
    await draftCell.getByRole("button", { name: "Open image", exact: true }).click();
    await expect(page.locator("[data-detail-image-id]")).toBeVisible();
    await page.goBack();
    await expect(form).toBeVisible();
    await expect(description).toHaveValue("Retained hosted draft");
    expect(new URL(page.url()).searchParams.get("batch")).toBe(batch);
    await page.goForward();
    await expect(page.locator("[data-detail-image-id]")).toBeVisible();
    expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(2);
    expect(escaped).toEqual([]);
  });

  test("denied upload permission hides entry and drops and refuses a retained batch detail URL", async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.addInitScript(() => localStorage.setItem("kupua-allow-uploads", "true"));
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true, canUpload: false } });
    await page.goto(`${origin}/__continuation?density=grid`);
    await new KupuaHelpers(page).waitForResults();
    expect(await page.evaluate(async () => {
      const path = "/src/lib/grid-api-instance.ts";
      return (await import(path)).getGridSessionPermissions();
    })).toMatchObject({ canUpload: false });
    await expect(page.getByRole("button", { name: "My recent uploads", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload files", exact: true })).toHaveCount(0);
    await expect(page.locator('[data-upload-dropzone], input[type="file"]')).toHaveCount(0);
    await page.evaluate(async () => {
      const contextPath = "/src/lib/browsing-context.tsx";
      const routerPath = "/src/router.ts";
      const id = "a".repeat(40);
      (await import(contextPath)).uploadBatchMembership.getState().set("local-denied", [id]);
      await (await import(routerPath)).router.navigate({ to: "/upload", search: { batch: "local-denied", image: id } });
    });
    await expect(page.getByText("You are not authorised to upload images.", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Upload batch", exact: true })).toHaveCount(0);
    await expect(page.locator('[aria-label^="Image results"], [data-detail-image-id], [data-upload-dropzone]')).toHaveCount(0);
    expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(0);
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await new KupuaHelpers(page).waitForResults();
  });

  test("upload opt-in, route-independent completion and activity detail preserve admission and history", async ({ page }, testInfo) => {
    const escaped: string[] = [];
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      escaped.push(new URL(route.request().url()).origin);
      return route.abort();
    });
    await page.addInitScript(() => {
      if (!localStorage.getItem("u3-initialized")) {
        localStorage.setItem("kupua-allow-editing", "true");
        localStorage.removeItem("kupua-allow-uploads");
        localStorage.setItem("u3-initialized", "true");
      }
    });
    await page.request.post(`${origin}/__upload-control`, { data: { reset: true } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    await page.evaluate(async () => {
      const routerPath = "/src/router.ts";
      await (await import(routerPath)).router.navigate({ to: "/upload", search: {} });
    });
    await expect(page.getByText("Uploads are disabled.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload files", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "My recent uploads", exact: true })).toHaveCount(0);
    await expect(page.locator('[data-upload-dropzone], input[type="file"]')).toHaveCount(0);
    await page.evaluate(async () => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      (await import(jobsPath)).submitUploadFiles([new File(["synthetic"], "blocked.jpg")]);
    });
    await expect.poll(() => page.evaluate(async () => {
      const path = "/src/stores/upload-jobs-store.ts";
      return (await import(path)).useUploadJobsStore.getState().batches[0]?.attempts[0]?.phase;
    })).toBe("blocked");
    expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(0);
    await page.evaluate(async () => {
      const path = "/src/stores/upload-jobs-store.ts";
      const jobs = await import(path);
      jobs.dismissUploadAttempt(jobs.useUploadJobsStore.getState().batches[0].attempts[0].id);
    });
    await page.keyboard.press("Shift+F12");
    const dialog = page.getByRole("dialog", { name: "Hello, Joshua", exact: true });
    await expect(dialog.getByRole("checkbox", { name: "Allow editing", exact: true })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Allow real uploads", exact: true })).not.toBeChecked();
    await dialog.getByRole("checkbox", { name: "Allow editing", exact: true }).uncheck();
    await dialog.getByRole("checkbox", { name: "Allow real uploads", exact: true }).check();
    await Promise.all([page.waitForEvent("load"), dialog.getByRole("button", { name: "Apply and reload", exact: true }).click()]);
    await expect(page.getByRole("button", { name: "Upload files", exact: true })).toBeEnabled();
    expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(0);
    expect(await page.evaluate(() => (window as CommandWindow).commandFixture.gridLabelEditingEnabled())).toBe(false);
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await new KupuaHelpers(page).waitForResults();
    await page.evaluate(async () => {
      const toastPath = "/src/stores/toast-store.ts";
      (await import(toastPath)).addToast({ category: "information", message: "Search notification" });
      const routerPath = "/src/router.ts";
      await (await import(routerPath)).router.navigate({ to: "/upload", search: {} });
    });
    const existingActivity = page.getByRole("complementary", { name: "Image activity", exact: true });
    await expect(existingActivity).toHaveCount(0);
    await page.locator('input[type="file"]').setInputFiles(resolve("../e2e-tests/fixtures/images/test.jpg"));
    await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(1);
    const batch = new URL(page.url()).searchParams.get("batch");
    expect(batch).toMatch(/^local-/);
    const uploadSummary = page.getByRole("button", { name: /^Upload activity:/ });
    await expect(uploadSummary).toBeVisible();
    await uploadSummary.click();
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await expect(page).toHaveURL(/\/search/);
    await expect.poll(() => page.evaluate(async batchId => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      return (await import(jobsPath)).useUploadJobsStore.getState().batches.find((item: any) => item.id === batchId)?.attempts[0].submission?.outcome;
    }, batch)).toBe("accepted");
    await page.evaluate(async batchId => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      const { useUploadJobsStore } = await import(jobsPath) as typeof import("../../src/stores/upload-jobs-store");
      useUploadJobsStore.setState(state => ({ batches: state.batches.map(batch => batch.id !== batchId ? batch : ({ ...batch,
        attempts: batch.attempts.map(attempt => ({ ...attempt,
          submission: { ...attempt.submission, outcome: "accepted", stage: "queued", queued: "rejected" },
        })),
      })) }));
    }, batch);
    const queuedReceipt = page.getByText("Queued update rejected; file transfer acknowledged", { exact: true });
    await expect(page.getByRole("button", { name: "Upload activity: 1 in progress", exact: true })).toBeVisible();
    await expect(queuedReceipt).toHaveCount(0);
    await expect(page.getByText("Upload receipt", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    await expect(page.getByRole("region", { name: "Upload activity", exact: true }).getByRole("combobox", { name: "Upload batch", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Go to recent uploads", exact: true }).click();
    await page.request.post(`${origin}/__upload-control`, { data: { status: "COMPLETED", visible: true } });
    await expect.poll(async () => (await (await page.request.get(`${origin}/__upload-control`)).json()).visibilityReads).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "Upload activity: 1 in progress", exact: true })).toBeVisible();
    expect(await page.evaluate(async batch => {
      const contextPath = "/src/lib/browsing-context.tsx";
      return (await import(contextPath)).uploadBatchMembership.getState().batches.get(batch!)!.ids;
    }, batch)).toEqual([]);
    await page.request.post(`${origin}/__upload-control`, { data: { searchable: true } });
    await expect(page.getByRole("button", { name: "Upload activity: 1 completed", exact: true })).toBeVisible();
    expect(await page.evaluate(async batchId => {
      const jobsPath = "/src/stores/upload-jobs-store.ts";
      return (await import(jobsPath)).useUploadJobsStore.getState().batches.find((item: any) => item.id === batchId)?.attempts[0].submission?.queued;
    }, batch)).toBe("rejected");
    await expect(queuedReceipt).toHaveCount(0);
    await expect(page.locator(`[data-image-id="${"f".repeat(40)}"]`)).toHaveCount(1);
    const before = await page.evaluate(() => history.length);
    await page.getByRole("button", { name: /^Upload activity:/ }).click();
    await page.getByRole("region", { name: "Upload activity", exact: true }).getByRole("button", { name: "test.jpg", exact: true }).click();
    await expect(page.locator(`[data-detail-image-id="${"f".repeat(40)}"]`)).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await page.goBack();
    await expect(page).not.toHaveURL(/image=/);
    await page.goBack();
    await expect(page).toHaveURL(/\/search/);
    await page.evaluate(() => Object.defineProperty(navigator, "standalone", { configurable: true, value: true }));
    await page.setViewportSize({ width: 390, height: 844 });
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
      await expect(page.locator("html")).toHaveAttribute("data-app-cutout", "true");
      const searchToolbar = page.getByRole("toolbar", { name: "Search and filter controls", exact: true });
      const recentEntry = searchToolbar.getByRole("button", { name: "My recent uploads", exact: true });
      await expect(recentEntry.locator("svg")).toBeVisible();
      await expect(recentEntry).toHaveText("");
      await expect(searchToolbar.getByRole("button", { name: "Upload files", exact: true })
        .locator('[data-toolbar-label="upload"]')).toBeHidden();
      const recentBounds = (await recentEntry.boundingBox())!;
      const homeBounds = (await searchToolbar.getByRole("link", { name: "Grid", exact: true }).boundingBox())!;
      const uploadBounds = (await searchToolbar.getByRole("button", { name: "Upload files", exact: true }).boundingBox())!;
      expect(recentBounds.x).toBeGreaterThan(homeBounds.x + homeBounds.width);
      expect(recentBounds.x + recentBounds.width).toBeLessThanOrEqual(uploadBounds.x);
      await recentEntry.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("u3-upload-compact.png") });
    } finally {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await touch.detach();
    }
    await expect(existingActivity).toHaveCount(0);
    expect(escaped).toEqual([]);
    expect((await (await page.request.get(`${origin}/__upload-control`)).json()).writes).toBe(1);
  });
});

async function runReadbackAction(page: Page, action: "holdReadbackSearch" | "releaseReadbackSearch") {
  const handle = await page.evaluateHandle(action => {
    const job = { complete: false, error: null as string | null, pending: Promise.resolve() };
    job.pending = (window as CommandWindow).editorFixture[action]().then(
      () => { job.complete = true; },
      error => { job.error = String(error); },
    );
    return job;
  }, action);
  await waitForFixtureSetup(page, handle);
}

test.describe("Unit B isolated continuation", () => {
  let vite: Awaited<ReturnType<typeof createServer>>;
  let origin: string;
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_MEDIA_DELIVERY: "canonical",
    VITE_GRID_METADATA_ORIGIN: "https://metadata.example.test" };
  let previous: Record<string, string | undefined>;
  const counts = (page: Page) => page.evaluate(async () => (await fetch("/__readback-control")).json()) as Promise<{
    pageReads: number; rankReads: number; countReads: number; mapReads: number; held: number; aborted: number; unexpected: string[];
    mgetReads: number; fullReads: number; fakeDispatches: number; staleDelivered: number;
  }>;
  test.beforeAll(async ({}, testInfo) => {
    previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"),
      plugins: [gridMutationPlugin("continuation")], server: { host: "127.0.0.1", port: 0 } });
    await vite.listen();
    origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
  });
  test.afterAll(async () => {
    await vite?.close();
    for (const [key, value] of Object.entries(previous ?? {})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  test.beforeEach(async ({ page }) => {
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 9_000_000 } });
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("kupua-upload-density")) sessionStorage.setItem("kupua-upload-density", new URL(location.href).searchParams.get("density") ?? "grid");
    });
  });
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => (window as Partial<CommandWindow>).editorFixture?.disposeReadback()).catch(() => {});
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
  });

  test("U4 submitted order reaches the last live member when an earlier retained image is search-excluded but mget-readable", async ({ page }) => {
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 201 } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    await page.request.post(`${origin}/__readback-control`, { data: { action: "hide-from-search", ids: ["local-0"] } });
    const mget = await (await page.request.post(`${origin}/api/images/mget`, { data: { ids: ["local-0"] } })).json();
    expect(mget.data[0].data.id).toBe("local-0");
    await page.evaluate(async () => {
      const contextPath = "/src/lib/browsing-context.tsx";
      const routerPath = "/src/router.ts";
      const { uploadBatchMembership } = await import(contextPath);
      uploadBatchMembership.getState().set("local-lifecycle", Array.from({ length: 201 }, (_, index) => `local-${index}`), undefined, true);
      await (await import(routerPath)).router.navigate({ to: "/upload", search: { batch: "local-lifecycle" } });
    });
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await expect(table.locator('[data-image-id="local-1"]')).toBeVisible();
    await expect(table.locator('[data-image-id="local-0"]')).toHaveCount(0);
    await page.keyboard.press("End");
    await expect(table.locator('[data-image-id="local-200"]')).toBeInViewport();
    expect(await page.evaluate(async () => {
      const contextPath = "/src/lib/browsing-context.tsx";
      return (await import(contextPath)).uploadBatchMembership.getState().batches.get("local-lifecycle").ids.length;
    })).toBe(201);
    expect((await counts(page)).unexpected).toEqual([]);
  });

  test("U2 form keeps editing and field position through held burst arrivals and context returns", async ({ page }) => {
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
    await page.goto(`${origin}/__continuation?density=table`);
    await new KupuaHelpers(page).waitForResults();
    await page.evaluate(async () => {
      sessionStorage.removeItem("kupua-upload-density");
      const contextPath = "/src/lib/browsing-context.tsx";
      const routerPath = "/src/router.ts";
      const layoutPath = "/src/stores/upload-layout-store.ts";
      (await import(contextPath)).uploadBatchMembership.getState().set("local-u2", [], undefined, true);
      (await import(layoutPath)).useUploadLayoutStore.getState().followBatch("local-u2");
      await (await import(routerPath)).router.navigate({ to: "/upload", search: { batch: "local-u2" } });
    });
    const region = page.getByRole("region", { name: "Image results form", exact: true });
    await expect(region).toBeVisible();
    await page.waitForFunction(() => !(window as CommandWindow).__kupua_store__.getState().loading);
    await page.evaluate(async () => {
      const path = "/src/lib/browsing-context.tsx";
      (await import(path)).uploadBatchMembership.getState().set("local-u2", ["local-20", "local-21"], undefined, true);
    });
    const early = region.locator('[data-measured-cell][data-image-id="local-20"]').getByRole("textbox", { name: "Description", exact: true });
    await expect(early).toBeEditable();
    const earlyTarget = await early.evaluateHandle(element => {
      element.focus({ preventScroll: true });
      return { element, top: element.getBoundingClientRect().top };
    });
    await page.evaluate(async () => {
      const path = "/src/lib/browsing-context.tsx";
      (await import(path)).uploadBatchMembership.getState().set("local-u2", Array.from({ length: 22 }, (_, index) => `local-${index}`), undefined, true);
    });
    await page.waitForFunction(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return !state.loading && state.uploadSections?.batch === 22;
    });
    expect(await earlyTarget.evaluate(({ element, top }) => ({ attached: element.isConnected, focused: document.activeElement === element,
      shift: Math.round(element.getBoundingClientRect().top - top) }))).toEqual({ attached: true, focused: true, shift: 0 });
    await earlyTarget.dispose();
    await region.getByRole("button", { name: "Go to start of current batch" }).click();
    await page.evaluate(async () => {
      const contextPath = "/src/lib/browsing-context.tsx";
      (await import(contextPath)).uploadBatchMembership.getState().set("local-u2", Array.from({ length: 60 }, (_, index) => `local-${index}`), undefined, true);
    });
    await page.waitForFunction(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return !state.loading && state.uploadSections?.batch === 60;
    });
    expect(await region.evaluate(element => element.scrollTop)).toBe(0);
    await region.locator('[data-measured-cell][data-image-id="local-0"] img').evaluate(async element => {
      const bitmap = element as HTMLImageElement;
      await bitmap.decode();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.naturalHeight; canvas.height = bitmap.naturalWidth;
      const context = canvas.getContext("2d")!;
      context.translate(canvas.width, 0); context.rotate(Math.PI / 2); context.drawImage(bitmap, 0, 0);
      const dimensions = { width: canvas.width, height: canvas.height };
      const store = (window as CommandWindow).__kupua_store__;
      store.setState(state => ({ results: state.results.map(image => image?.id === "local-0" ? { ...image,
        source: { ...image.source!, dimensions, orientedDimensions: dimensions },
        thumbnail: { ...image.thumbnail!, secureUrl: canvas.toDataURL(), mimeType: "image/png", dimensions },
      } : image) }));
    });
    const viewport = page.viewportSize()!;
    for (const width of [viewport.width, 390]) {
      await page.setViewportSize({ width, height: viewport.height });
      await expect.poll(() => region.locator('[data-measured-cell][data-image-id="local-0"] img').evaluate(element => {
        const image = element as HTMLImageElement;
        const preview = image.closest('[role="button"]')!.getBoundingClientRect();
        const column = image.closest('[data-measured-field="image"]')!.getBoundingClientRect();
        return { portrait: image.naturalHeight > image.naturalWidth, fit: getComputedStyle(image).objectFit,
          height: preview.height, withinColumn: preview.left >= column.left && preview.right <= column.right };
      })).toEqual({ portrait: true, fit: "contain", height: 256, withinColumn: true });
    }
    await page.setViewportSize(viewport);
    const preview = region.locator('[data-measured-cell][data-image-id="local-0"]');
    await preview.locator("p").first().click({ button: "middle" });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(page.locator('[data-fullscreen-preview="active"]')).toHaveCount(0);
    await preview.getByRole("button", { name: "Open image", exact: true }).click({ button: "middle" });
    await expect(page.locator('[data-fullscreen-preview="active"]')).toBeVisible();
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('[data-fullscreen-preview="active"]')).toHaveCount(0);
    await page.evaluate(() => {
      const store = (window as CommandWindow).__kupua_store__;
      const source = store.getState().dataSource;
      const original = source.searchAfter.bind(source);
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const probe = { calls: 0, pulses: [] as string[], input: document.activeElement, release, cleanup: () => {} };
      const unsubscribe = store.subscribe((state, previous) => {
        if (state._phantomPulseImageId && state._phantomPulseImageId !== previous._phantomPulseImageId) probe.pulses.push(state._phantomPulseImageId);
      });
      source.searchAfter = async (...args) => {
        if (!args[0].recentUploadScope?.combined) return original(...args);
        probe.calls++;
        const result = await original(...args);
        if (probe.calls === 1) await held;
        return result;
      };
      probe.cleanup = () => { release(); unsubscribe(); source.searchAfter = original; delete (window as any).__u2Arrivals; };
      (window as any).__u2Arrivals = probe;
    });
    const arrive = (length: number) => page.evaluate(async length => {
      const contextPath = "/src/lib/browsing-context.tsx";
      const members = Array.from({ length }, (_, index) => `local-${index}`);
      if (length > 62) members.unshift(...members.splice(62));
      (await import(contextPath)).uploadBatchMembership.getState().set("local-u2", members, undefined, true);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, length);
    await arrive(61);
    await page.waitForFunction(() => (window as any).__u2Arrivals.calls === 1);
    const cell = region.locator('[data-image-id="local-1"]');
    const takenOn = cell.getByLabel("Taken on", { exact: true });
    await takenOn.fill("2026-11-18T12:00");
    for (let segment = 0; segment < 8; segment++) await takenOn.press("ArrowLeft");
    await takenOn.press("Backspace");
    await takenOn.press("0");
    await takenOn.press("2");
    await expect(takenOn).toHaveValue("2026-11-02T12:00");
    const input = cell.getByRole("textbox", { name: "Description", exact: true });
    const originalDraft = "A retained editorial description. ".repeat(50);
    const composedDraft = originalDraft.slice(0, 4) + "composed" + originalDraft.slice(12);
    await input.fill(originalDraft);
    await input.evaluate(element => {
      (window as any).__u2Arrivals.input = element;
      const region = element.closest('[role="region"]')!;
      region.scrollTop += element.getBoundingClientRect().top - region.getBoundingClientRect().top - 100;
      (element as HTMLTextAreaElement).setSelectionRange(4, 12);
    });
    const top = await input.evaluate(element => element.getBoundingClientRect().top - element.closest('[role="region"]')!.getBoundingClientRect().top);
    const composition = await page.context().newCDPSession(page);
    let composing = false;
    try {
      await composition.send("Input.imeSetComposition", { text: "composed", selectionStart: 2, selectionEnd: 5 });
      composing = true;
      for (const length of [62, 63, 64]) await arrive(length);
      expect(await page.evaluate(() => (window as any).__u2Arrivals.calls)).toBe(1);
      await page.evaluate(() => (window as any).__u2Arrivals.release());
      await page.waitForFunction(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return !state.loading && state.uploadSections?.batch === 64;
      });
      expect(await page.evaluate(() => (window as any).__u2Arrivals.calls)).toBe(2);
      expect(await page.evaluate(() => (window as any).__u2Arrivals.pulses)).toEqual([]);
      expect(await input.evaluate(element => element === (window as any).__u2Arrivals.input)).toBe(true);
      await expect(input).toBeFocused();
      expect(await input.evaluate(element => [(element as HTMLTextAreaElement).selectionStart, (element as HTMLTextAreaElement).selectionEnd])).toEqual([6, 9]);
      expect(await input.evaluate(element => element.getBoundingClientRect().top - element.closest('[role="region"]')!.getBoundingClientRect().top)).toBe(top);
      await expect(input).toHaveValue(composedDraft);
      await composition.send("Input.insertText", { text: "composed" });
      composing = false;
      await expect(input).toHaveValue(composedDraft);
      expect(new URL(page.url()).searchParams.has("image")).toBe(false);
      await input.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("[data-measured-cell]")?.getAttribute("data-image-id"))).toBe("local-1");
    } finally {
      if (composing) await composition.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
      await composition.detach();
      await page.evaluate(() => (window as any).__u2Arrivals?.cleanup());
    }
    await cell.locator(':is(input,textarea,select,button,a[href],[tabindex="0"]):not([disabled]):visible').last().focus();
    await region.evaluate(async element => {
      const path = "/src/lib/scroll-geometry-ref.ts";
      const geometry = (await import(path)).getLayoutGeometry();
      element.scrollTop = geometry.layout.getItemRow(geometry.window.findItemIndex("local-30")).top;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(region.locator('[data-image-id="local-30"]')).toBeInViewport();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("[data-measured-cell]")?.getAttribute("data-image-id"))).toBe("local-2");
    for (const density of ["grid", "table", "justified", "form"] as const) {
      await (await getDensityChangeButton(page, density))?.click();
      await expect(page.getByRole("region", { name: `Image results ${density}`, exact: true })).toBeVisible();
    }
    await expect(input).toHaveValue(composedDraft);
    await expect(takenOn).toHaveValue("2026-11-02T12:00");
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await expect(page.getByRole("region", { name: "Image results table", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Form view", exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(input).toHaveValue(composedDraft);
    expect((await counts(page)).fakeDispatches).toBe(0);
    expect((await counts(page)).unexpected).toEqual([]);
    await cell.getByRole("button", { name: "Open image", exact: true }).click();
    const detail = page.locator('[data-detail-image-id="local-1"]');
    await expect(detail).toBeVisible();
    await detail.getByRole("link", { name: "Grid", exact: true }).click();
    await new KupuaHelpers(page).waitForResults();
    expect(await page.evaluate(async () => {
      const path = "/src/stores/ui-prefs-store.ts";
      return (await import(path)).useUiPrefsStore.getState().densityContext;
    })).toBe("search");
    await (await getDensityChangeButton(page, "table"))?.click();
    expect(await page.evaluate(() => sessionStorage.getItem("kupua-density"))).toBe("table");
    expect(await page.evaluate(() => sessionStorage.getItem("kupua-upload-density"))).toBe("form");
    await page.evaluate(async () => {
      const path = "/src/router.ts";
      await (await import(path)).router.navigate({ to: "/upload", search: { batch: "local-u2" } });
    });
    await expect(region).toBeVisible();
    await page.getByRole("button", { name: "Publish unavailable", exact: true }).click();
    const unavailable = region.locator('[data-measured-field="image"] [data-unavailable]').first();
    await expect(unavailable).toBeAttached();
    expect(await unavailable.evaluate(element => element.getBoundingClientRect().width))
      .toBe(await unavailable.evaluate(element => element.closest('[data-measured-field="image"]')!.getBoundingClientRect().width));
  });

  test.describe("U2 compact form", () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
    test("keeps lower-field suggestions usable in a reduced keyboard viewport", async ({ page }, info) => {
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 8 } });
      await page.goto(`${origin}/__continuation?density=grid`);
      await new KupuaHelpers(page).waitForResults();
      await page.evaluate(async () => {
        sessionStorage.removeItem("kupua-upload-density");
        const contextPath = "/src/lib/browsing-context.tsx";
        const routerPath = "/src/router.ts";
        (await import(contextPath)).uploadBatchMembership.getState().set("local-phone", Array.from({ length: 8 }, (_, index) => `local-${index}`), undefined, true);
        await (await import(routerPath)).router.navigate({ to: "/upload", search: { batch: "local-phone" } });
      });
      const region = page.getByRole("region", { name: "Image results form", exact: true });
      await expect(region).toBeVisible();
      await page.setViewportSize({ width: 390, height: 420 });
      await expect(page.locator('html[data-shell="compact"]')).toHaveCount(1);
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const creditOptions: Parameters<Page["route"]>[1] = route => route.fulfill({ json: {
        fields: { "metadata.credit": { buckets: [{ key: "Reuters", count: 2 }] } }, isFilterCounts: {},
      } });
      await page.route("**/images/aggregations", creditOptions);
      try {
        const credit = region.locator('[data-image-id="local-1"]').getByRole("combobox", { name: "Credit", exact: true });
        await credit.fill("Re");
        const suggestions = page.getByRole("listbox", { name: "Suggestions for Credit", exact: true });
        await expect(suggestions).toBeVisible();
        await expect(credit).toBeInViewport();
        const bounds = (await suggestions.boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(420);
        await page.screenshot({ path: info.outputPath("form-compact-keyboard.png") });
        await suggestions.getByRole("option", { name: "Reuters 2", exact: true }).tap();
        await expect(credit).toHaveValue("Reuters");
        await expect(credit).toBeFocused();
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(credit).toHaveValue("Reuters");
        expect(await region.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      } finally { await page.unroute("**/images/aggregations", creditOptions); }
      expect((await counts(page)).fakeDispatches).toBe(0);
    });
  });

  test("U1 API browsing returns between filtered search, batch, densities, detail and crop without selection leakage", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kupua-allow-editing", "true"));
    const kupua = new KupuaHelpers(page);
    const mediaOrigin = "https://api.media.local.dev-gutools.co.uk";
    const cropper = "https://cropper.media.local.dev-gutools.co.uk";
    const cropRendition = `${origin}/__publication-media/embedded-metadata.jpg?crop=fixture`;
    let saved: { imageId: string; crop: { id: string; date: string; assets: unknown[]; specification: object } } | undefined;
    let cropPosts = 0;
    let cropReadbacks = 0;
    let exposeSavedCrop = false;
    await page.route(`${origin}/api`, async route => {
      const response = await route.fetch();
      const root = await response.json();
      return route.fulfill({ response, json: { ...root, links: [...root.links, { rel: "cropper", href: cropper }] } });
    });
    await page.route(`${origin}/grid-local-cropper/`, route => route.fulfill({ json: { links: [{ rel: "crop", href: `${cropper}/crops` }] } }));
    await page.route(`${origin}/grid-local-cropper/crops`, route => {
      expect(route.request().method()).toBe("POST");
      const { type, source, x, y, width, height, aspectRatio } = route.request().postDataJSON();
      expect(type).toBe("crop");
      expect(width).toBe(320);
      expect(source).toMatch(new RegExp(`^${mediaOrigin.replaceAll(".", "\\.")}/images/local-\\d+$`));
      cropPosts++;
      const crop = { id: `${x}_${y}_${width}_${height}`, date: "2026-11-26T12:34:56.123Z",
        assets: [{ mimeType: "image/jpeg", dimensions: { width, height }, file: cropRendition }],
        specification: { uri: source, type, aspectRatio, bounds: { x, y, width, height } } };
      saved = { imageId: new URL(source).pathname.split("/").at(-1)!, crop };
      return route.fulfill({ json: crop });
    });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 10_000 } });
    await page.route((url: URL) => url.origin === origin && /^\/api\/images\/(?:mget|search-after|window|local-\d+)$/.test(url.pathname), async route => {
      const request = route.request();
      const singleton = /\/local-\d+$/.test(new URL(request.url()).pathname);
      if (request.method() !== (singleton ? "GET" : "POST")) return route.fallback();
      const response = await route.fetch();
      const body = await response.json();
      const entities = Array.isArray(body.data) ? body.data : [body];
      for (const entity of entities) {
        if (singleton) delete entity.uri;
        else entity.uri = `${mediaOrigin}/images/${entity.data.id}`;
        entity.links.push({ rel: "crops", href: `${cropper}/crops/${entity.data.id}` });
        if (saved && entity.data.id === saved.imageId) {
          if (singleton) cropReadbacks++;
          if (exposeSavedCrop) entity.data.exports = [saved.crop];
        }
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto(`${origin}/__continuation?density=table`);
    await kupua.waitForResults();
    expect(await page.evaluate(async () => {
      const apiPath = "/src/dal/api-data-source.ts";
      const { ApiDataSource } = await import(apiPath);
      return (window as any).__kupua_store__.getState().dataSource instanceof ApiDataSource;
    })).toBe(true);
    await kupua.seekTo(0.35);
    await page.evaluate(async () => {
      const contextPath = "/src/lib/browsing-context.tsx";
      const { uploadBatchMembership } = await import(contextPath);
      const state = (window as any).__kupua_store__.getState();
      const ids = state.results.filter(Boolean).slice(0, 80).map((image: any) => image.id);
      uploadBatchMembership.getState().set("local-u1", ids);
      const selected = (window as any).__kupua_selection_store__.getState();
      selected.toggle(ids[0], state.results[0]);
    });
    await kupua.waitForHitTestedImagePoint({ view: "table", topInset: 100 });
    const departure = await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      const id = (window as any).__kupua_getViewportAnchorId__();
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!;
      return { id, top: cell.getBoundingClientRect().top - container.getBoundingClientRect().top,
        rank: state.imagePositions.get(id), selected: [...(window as any).__kupua_selection_store__.getState().selectedIds], href: location.search };
    });
    expect(departure.selected).toHaveLength(1);
    const scopedRead = page.waitForRequest(request => request.method() === "POST"
      && request.url() === `${origin}/api/images/search-after` && Array.isArray(request.postDataJSON().ids));
    await page.evaluate(async () => {
      const routerPath = "/src/router.ts";
      const keyPath = "/src/lib/orchestration/history-key.ts";
      const { router } = await import(routerPath);
      const { withFreshKupuaKey } = await import(keyPath);
      await router.navigate({ to: "/upload", search: { batch: "local-u1" }, state: withFreshKupuaKey() });
    });
    const batchBody = (await scopedRead).postDataJSON();
    expect(batchBody.ids).toHaveLength(80);
    expect(batchBody.q).toBe("");
    expect(batchBody).not.toHaveProperty("imageScope");
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return !state.loading && state.params.recentUploadScope?.batch?.key === "upload:local-u1" && state.uploadSections?.batch === 80;
    });
    expect(await page.evaluate(() => {
      const state = (window as any).__kupua_store__.getState();
      return { query: state.params.query, since: state.params.since, until: state.params.until,
        nonFree: state.params.nonFree, selected: [...(window as any).__kupua_selection_store__.getState().selectedIds] };
    })).toEqual({ query: undefined, since: undefined, until: undefined, nonFree: "true", selected: departure.selected });
    await expect(page.getByRole("button", { name: "Select image", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Details panel|Browse panel|Deselect/ })).toHaveCount(0);
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await table.evaluate(element => { element.scrollTop = 650; });
    await kupua.waitForHitTestedImagePoint({ view: "table", topInset: 100 });
    const batchAnchor = await page.evaluate(() => {
      const id: string = (window as any).__kupua_getViewportAnchorId__();
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!;
      return { id, top: cell.getBoundingClientRect().top - container.getBoundingClientRect().top };
    });
    for (const density of ["Grid", "Justified", "Table"]) {
      await page.getByRole("button", { name: `${density} view`, exact: true }).click();
      await expect(page.getByRole("button", { name: `${density} view`, exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    await expect.poll(async () => page.evaluate(({ id, top }) => {
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
      return cell ? Math.abs(cell.getBoundingClientRect().top - container.getBoundingClientRect().top - top) : null;
    }, batchAnchor)).toBeLessThan(1);
    await page.locator(`[data-image-id="${batchAnchor.id}"]`).click();
    await expect(page.locator(`[data-detail-image-id="${batchAnchor.id}"]`)).toBeVisible();
    await page.getByRole("button", { name: "Crop image", exact: true }).click();
    const crop = page.getByRole("dialog", { name: "Crop image", exact: true });
    await expect(crop).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/upload");
    expect(new URL(page.url()).searchParams.get("batch")).toBe("local-u1");
    await crop.getByRole("button", { name: "Back to image", exact: true }).click();
    await expect(crop).toBeHidden();
    await page.getByRole("button", { name: "Crop image", exact: true }).click();
    await crop.getByRole("spinbutton", { name: "Crop width" }).fill("320");
    await crop.getByRole("button", { name: "Crop", exact: true }).click();
    await expect.poll(() => cropReadbacks).toBeGreaterThan(0);
    await expect(crop.getByRole("button", { name: "Crop", exact: true })).toHaveAttribute("aria-busy", "true");
    expect(cropPosts).toBe(1);
    exposeSavedCrop = true;
    await expect(crop).toBeHidden();
    expect(cropPosts).toBe(1);
    expect(saved?.imageId).toBe(batchAnchor.id);
    await expect.poll(() => new URL(page.url()).searchParams.get("crop")).toBe(saved?.crop.id);
    await expect(page.getByTestId("detail-image-container").locator('img[fetchpriority="high"]')).toHaveAttribute("src", cropRendition);
    await page.goBack();
    await expect(table).toBeVisible();
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return !state.loading && !state.params.recentUploadScope && state._searchContinuity?.phase === "placed";
    });
    expect(new URL(page.url()).pathname).toBe("/search");
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(Object.fromEntries(new URLSearchParams(departure.href)));
    await expect.poll(async () => page.evaluate(({ id, top, rank }) => {
      const state = (window as any).__kupua_store__.getState();
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
      return cell && state.imagePositions.get(id) === rank ? Math.abs(cell.getBoundingClientRect().top - container.getBoundingClientRect().top - top) : null;
    }, departure)).toBeLessThan(1);
    await page.evaluate(async () => {
      const contextPath = "/src/lib/browsing-context.tsx";
      const { uploadBatchMembership } = await import(contextPath);
      const registry = uploadBatchMembership.getState();
      const batch = registry.batches.get("local-u1")!;
      const next = (window as any).__kupua_store__.getState().results.find((image: any) => image && !batch.ids.includes(image.id));
      registry.set("local-u1", [...batch.ids, next.id]);
    });
    await page.goBack();
    await page.waitForFunction(() => {
      const state = (window as any).__kupua_store__.getState();
      return !state.loading && state.params.recentUploadScope?.batch?.revision === 2;
    });
    expect(new URL(page.url()).searchParams.get("batch")).toBe("local-u1");
    await expect.poll(async () => page.evaluate(({ id, top }) => {
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
      return cell ? Math.abs(cell.getBoundingClientRect().top - container.getBoundingClientRect().top - top) : null;
    }, batchAnchor)).toBeLessThan(1);
    expect(await page.evaluate(() => [...(window as any).__kupua_selection_store__.getState().selectedIds])).toEqual(departure.selected);
    await page.locator(`[data-image-id="${batchAnchor.id}"]`).click();
    const detail = page.locator(`[data-detail-image-id="${batchAnchor.id}"]`);
    await expect(detail).toBeVisible();
    await detail.getByRole("link", { name: "Grid", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__kupua_store__.getState().params.recentUploadScope)).toBeUndefined();
    await kupua.waitForResults();
    expect(new URL(page.url()).pathname).toBe("/search");
    await page.goBack();
    await expect(detail).toBeVisible();
    expect(await page.evaluate(async () => {
      const prefsPath = "/src/stores/ui-prefs-store.ts";
      return (await import(prefsPath)).useUiPrefsStore.getState().density;
    })).toBe("table");
    await page.goBack();
    await expect(table).toBeVisible();
    await expect.poll(() => page.evaluate(({ id, top }) => {
      const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
      const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
      return cell ? Math.abs(cell.getBoundingClientRect().top - container.getBoundingClientRect().top - top) : null;
    }, batchAnchor)).toBeLessThan(1);
    expect((await counts(page)).unexpected).toEqual([]);
  });

  test("U1 API browsing admits distinct batches and revisions without widening empty or missing links", async ({ page }) => {
    const kupua = new KupuaHelpers(page);
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
    await page.goto(`${origin}/__readback?density=grid`);
    await kupua.waitForResults();
    await page.evaluate(async () => {
      const apiPath = "/src/dal/api-data-source.ts";
      const { ApiDataSource } = await import(apiPath);
      const contextPath = "/src/lib/browsing-context.tsx";
      const { uploadBatchMembership } = await import(contextPath);
      const state = (window as any).__kupua_store__.getState();
      if (!(state.dataSource instanceof ApiDataSource)) throw new Error("U1 must exercise ApiDataSource");
      const ids = state.results.filter(Boolean).slice(0, 120).map((image: any) => image.id);
      uploadBatchMembership.getState().set("local-slow", ids);
      uploadBatchMembership.getState().set("local-active", ids.slice(0, 80));
      uploadBatchMembership.getState().set("local-empty", []);
      const source = state.dataSource;
      const originalPage = source.searchAfter.bind(source);
      const originalCount = source.countWithTickers.bind(source);
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const control = { calls: 0, held: false, released: false, ids, release,
        dispose: () => { release(); source.searchAfter = originalPage; source.countWithTickers = originalCount; } };
      (window as any).__u1Admission = control;
      source.searchAfter = async (...args: any[]) => {
        if (args[0].imageScope) control.calls++;
        const result = await originalPage(...args);
        if (args[0].recentUploadScope?.batch?.key === "upload:local-slow") {
          control.held = true;
          await held;
          control.released = true;
        }
        return result;
      };
      source.countWithTickers = (...args: any[]) => { if (args[0].imageScope) control.calls++; return originalCount(...args); };
    });
    const visit = async (batch: string, image?: string) => page.evaluate(async ({ batch, image }) => {
      const routerPath = "/src/router.ts";
      const keyPath = "/src/lib/orchestration/history-key.ts";
      const { router } = await import(routerPath);
      const { withFreshKupuaKey } = await import(keyPath);
      await router.navigate({ to: "/upload", search: { batch, image, orderBy: "-uploadTime" }, state: withFreshKupuaKey() });
    }, { batch, image });
    try {
      await visit("local-slow");
      await page.waitForFunction(() => (window as any).__u1Admission.held);
      await visit("local-active");
      await page.waitForFunction(() => {
        const state = (window as any).__kupua_store__.getState();
        return !state.loading && state.params.recentUploadScope?.batch?.key === "upload:local-active" && state.uploadSections?.batch === 80;
      });
      await page.evaluate(() => (window as any).__u1Admission.release());
      await page.waitForFunction(() => (window as any).__u1Admission.released);
      expect(await page.evaluate(() => {
        const state = (window as any).__kupua_store__.getState();
        return { key: state.params.recentUploadScope.batch.key, total: state.uploadSections.batch };
      })).toEqual({ key: "upload:local-active", total: 80 });
      await (await getDensityChangeButton(page, "table"))?.click();
      await page.getByRole("region", { name: "Image results table", exact: true }).evaluate(element => { element.scrollTop = 650; });
      await kupua.waitForHitTestedImagePoint({ view: "table", topInset: 100 });
      const arrivalAnchor = await page.evaluate(() => {
        const state = (window as any).__kupua_store__.getState();
        const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
        const id = (window as any).__kupua_getViewportAnchorId__();
        const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`)!;
        return { id, focus: state.focusedImageId, top: cell.getBoundingClientRect().top - container.getBoundingClientRect().top };
      });
      expect(arrivalAnchor.focus).toBeNull();
      await page.evaluate(async () => {
        const contextPath = "/src/lib/browsing-context.tsx";
        const { uploadBatchMembership } = await import(contextPath);
        uploadBatchMembership.getState().set("local-active", (window as any).__u1Admission.ids.slice(0, 100));
      });
      await page.waitForFunction(() => {
        const state = (window as any).__kupua_store__.getState();
        return !state.loading && state.params.recentUploadScope?.batch?.revision === 2 && state.uploadSections?.batch === 100;
      });
      await expect.poll(() => page.evaluate(({ id, top }) => {
        const container = document.querySelector<HTMLElement>('[aria-label="Image results table"]')!;
        const cell = container.querySelector(`[data-image-id="${CSS.escape(id)}"]`);
        return cell ? Math.abs(cell.getBoundingClientRect().top - container.getBoundingClientRect().top - top) : null;
      }, arrivalAnchor)).toBeLessThan(1);
      await page.getByRole("button", { name: "Back to search", exact: true }).click();
      await expect(page.getByRole("button", { name: "Grid view", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.goBack();
      await expect(page.getByRole("button", { name: "Table view", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.goForward();
      await expect(page.getByRole("button", { name: "Grid view", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.goBack();
      await expect(page.getByRole("button", { name: "Table view", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
      const calls = await page.evaluate(() => (window as any).__u1Admission.calls);
      for (const batch of ["local-empty", "local-missing"]) {
        await visit(batch, "outside-batch");
        if (batch === "local-missing") await expect(page.getByText("This local batch is unavailable in this tab.", { exact: true })).toBeVisible();
        else {
          await expect(page.getByRole("region", { name: "Current batch", exact: true })).toBeVisible();
          await expect(page.getByText("This batch has no available images yet.", { exact: true })).toHaveCount(0);
          await expect(page.getByText("This local batch is unavailable in this tab.", { exact: true })).toHaveCount(0);
        }
        expect(await page.evaluate(() => (window as any).__u1Admission.calls)).toBe(calls);
        expect(await page.evaluate(() => (window as any).__kupua_store__.getState().uploadSections.batch)).toBe(0);
        await expect(page.locator("[data-detail-image-id]")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Back to search", exact: true }).click();
      await page.evaluate(() => (window as any).__kupua_toast_store__._store.getState()._clearAll());
      await page.getByRole("button", { name: "My recent uploads", exact: true }).click();
      await expect(page.getByText("My other uploads are unavailable. Reload after signing in.", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => (window as any).__u1Admission.calls)).toBe(calls);
    } finally {
      await page.evaluate(() => { (window as any).__u1Admission?.dispose(); delete (window as any).__u1Admission; });
    }
    await page.goto(`${origin}/upload?batch=local-missing&image=outside-batch`);
    await expect(page.getByText("This local batch is unavailable in this tab.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to search", exact: true })).toBeVisible();
    expect((await counts(page)).unexpected).toEqual([]);
  });

  test.describe("U1 compact Upload controls", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("touch refresh and sorting keep library selection dormant", async ({ page }) => {
      const kupua = new KupuaHelpers(page);
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
      await page.goto(`${origin}/__readback?density=grid`);
      await kupua.waitForResults();
      const selected = await page.evaluate(async () => {
        const contextPath = "/src/lib/browsing-context.tsx";
        const panelPath = "/src/stores/panel-store.ts";
        const toastPath = "/src/stores/toast-store.ts";
        const { uploadBatchMembership } = await import(contextPath);
        const { usePanelStore } = await import(panelPath);
        const { addToast } = await import(toastPath);
        const state = (window as any).__kupua_store__.getState();
        const images = state.results.filter(Boolean);
        const image = images[100];
        (window as any).__kupua_selection_store__.getState().toggle(image.id, image);
        uploadBatchMembership.getState().set("local-compact", images.slice(0, 80).map((item: any) => item.id));
        if (!usePanelStore.getState().config.right.visible) usePanelStore.getState().togglePanel("right");
        addToast({ category: "information", message: "Search notification" });
        return [image.id];
      });
      const activity = page.getByRole("complementary", { name: "Image activity", exact: true });
      await expect(page.getByText("Search notification", { exact: true })).toBeVisible();
      await expect(activity).toHaveCount(0);
      await page.evaluate(async () => {
        const routerPath = "/src/router.ts";
        const keyPath = "/src/lib/orchestration/history-key.ts";
        const { router } = await import(routerPath);
        const { withFreshKupuaKey } = await import(keyPath);
        await router.navigate({ to: "/upload", search: { batch: "local-compact" }, state: withFreshKupuaKey() });
      });
      await page.waitForFunction(() => {
        const state = (window as any).__kupua_store__.getState();
        return !state.loading && state.params.recentUploadScope?.batch?.key === "upload:local-compact" && state.uploadSections?.batch === 80;
      });
      await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await expect(activity).toHaveCount(0);
      await expect(page.locator("[data-tickbox]")).toHaveCount(0);
      const point = await kupua.waitForHitTestedImagePoint({ view: "grid" });
      const target = await page.locator(`[data-image-id="${point.imageId}"]`).elementHandle();
      if (!target) throw new Error("Upload gesture target unavailable");
      try {
        await target.evaluate((element, point) => {
          element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch", clientX: point.x, clientY: point.y }));
          const start = new Event("touchstart", { bubbles: true, cancelable: true });
          Object.defineProperty(start, "touches", { value: [{ clientX: point.x, clientY: point.y }] });
          element.dispatchEvent(start);
        }, point);
        await page.waitForTimeout(650);
        const claim = await target.evaluate((element, point) => {
          const move = new Event("touchmove", { bubbles: true, cancelable: true });
          Object.defineProperty(move, "touches", { value: [{ clientX: point.x, clientY: point.y - 40 }] });
          element.dispatchEvent(move);
          return { prevented: move.defaultPrevented, selecting: document.body.dataset.dragSelecting };
        }, point);
        expect(claim).toEqual({ prevented: false, selecting: undefined });
      } finally {
        await target.evaluate(element => {
          element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "touch" }));
          const end = new Event("touchend", { bubbles: true });
          Object.defineProperty(end, "touches", { value: [] });
          element.dispatchEvent(end);
        });
        await target.dispose();
      }
      const beforeRefresh = await counts(page);
      const refreshRead = page.waitForRequest(request => request.method() === "POST"
        && request.url() === `${origin}/api/images/search-after` && Array.isArray(request.postDataJSON().ids));
      await page.getByRole("region", { name: "Image results grid", exact: true }).evaluate(element => {
        element.scrollTop = 0;
        const top = element.getBoundingClientRect().top + 20;
        for (const [type, clientY] of [["touchstart", top], ["touchmove", top + 160], ["touchend", null]] as const) {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(event, "touches", { value: clientY === null ? [] : [{ clientX: 100, clientY }] });
          element.dispatchEvent(event);
        }
      });
      expect((await refreshRead).postDataJSON().ids).toHaveLength(80);
      await page.waitForFunction(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return !state.loading && !state.error && state.uploadSections?.batch === 80;
      });
      expect((await counts(page)).countReads).toBe(beforeRefresh.countReads + 1);
      expect(await page.evaluate(() => [...(window as any).__kupua_selection_store__.getState().selectedIds])).toEqual(selected);
      const sort = page.getByRole("button", { name: "Sort by: Uploaded", exact: true });
      await expect(sort).toBeVisible();
      await page.setViewportSize({ width: 390, height: 320 });
      await sort.click();
      const menu = page.getByRole("listbox", { name: "Sort field", exact: true });
      await expect(menu).toBeVisible();
      await page.keyboard.press("End");
      const lastVisible = await menu.getByRole("option").last().evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const menuBounds = element.parentElement!.getBoundingClientRect();
        return bounds.top >= menuBounds.top && bounds.bottom <= Math.min(innerHeight, menuBounds.bottom);
      });
      await page.keyboard.press("Tab");
      const forward = await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).evaluate(element => element === document.activeElement);
      await sort.press("ArrowDown");
      await page.keyboard.press("Shift+Tab");
      const backward = await page.getByRole("combobox", { name: "Upload batch", exact: true }).evaluate(element => element === document.activeElement);
      expect({ lastVisible, forward, backward }).toEqual({ lastVisible: true, forward: true, backward: true });
      await sort.press("ArrowDown");
      await page.keyboard.press("Escape");
      await expect(sort).toBeFocused();
      await sort.press("ArrowDown");
      const lastLabel = (await menu.getByRole("option").last().innerText()).trim();
      await menu.getByRole("option").last().click();
      await page.getByRole("button", { name: `Sort by: ${lastLabel}`, exact: true }).press("ArrowDown");
      const selectedOption = menu.getByRole("option", { name: lastLabel, exact: true });
      await expect(selectedOption).toBeFocused();
      expect(await selectedOption.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const menuBounds = element.parentElement!.getBoundingClientRect();
        return bounds.top >= menuBounds.top && bounds.bottom <= Math.min(innerHeight, menuBounds.bottom);
      })).toBe(true);
      await menu.getByRole("option", { name: "Uploaded", exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      const sortedRead = page.waitForRequest(request => request.method() === "POST"
        && request.url() === `${origin}/api/images/search-after` && request.postDataJSON().orderBy === "uploadTime");
      await page.getByRole("button", { name: "Sort descending, click to sort ascending", exact: true }).click();
      expect((await sortedRead).postDataJSON().ids).toHaveLength(80);
      expect(new URL(page.url()).pathname).toBe("/upload");
      expect(new URL(page.url()).searchParams.get("batch")).toBe("local-compact");
      expect(await page.evaluate(() => [...(window as any).__kupua_selection_store__.getState().selectedIds])).toEqual(selected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await counts(page)).unexpected).toEqual([]);
    });
  });

  test("saved-crop links replace rendition state without new history or search work", async ({ page }, testInfo) => {
    await page.route(/\/api\/images\/(?:mget|search-after|window|local-\d+)$/, async route => {
      const response = await route.fetch();
      const body = await response.json();
      const entities = Array.isArray(body.data) ? body.data : [body];
      for (const entity of entities) {
        entity.links.push({ rel: "crops", href: `${origin}/crops/${entity.data.id}` });
        entity.data.exports = [{ id: "saved", specification: { type: "crop", aspectRatio: "16:9", bounds: { x: 0, y: 0, width: 1600, height: 900 } },
          assets: [{ mimeType: "image/jpeg", dimensions: { width: 1600, height: 900 }, secureUrl: `${origin}/__publication-media/test-card-f.jpg` }] }];
      }
      await route.fulfill({ response, json: body });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/__readback?density=grid`);
    await page.evaluate(async modulePath => {
      const { router } = await import(modulePath);
      await router.navigate({ to: "/images/$imageId", params: { imageId: "local-0" }, search: { crop: "saved" } });
    }, "/src/router.ts");
    const rail = page.getByRole("complementary", { name: "Image original and crops select" });
    const saved = rail.getByRole("button", { name: "View 1600 by 900 crop" });
    await expect(saved).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/search\?.*crop=saved/);
    const toolbar = page.locator("header.detail-toolbar");
    const share = toolbar.getByRole("button", { name: "Share with URL" });
    for (const width of [1280, 1024, 900, 800, 720, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(share.locator(".image-action-full")).toBeVisible({ visible: width >= 1000 });
      await expect(share.locator(".image-action-short")).toBeVisible({ visible: width >= 750 && width < 1000 });
      await expect.poll(() => toolbar.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const controls = [...element.children].map(child => child.getBoundingClientRect()).filter(box => box.width > 0);
        return controls.every((box, index) => box.left >= bounds.left - 1 && box.right <= bounds.right + 1
          && (index === 0 || box.left >= controls[index - 1].right - 1));
      })).toBe(true);
      if (width === 1280 || width === 640) await page.screenshot({ path: testInfo.outputPath(`detail-labels-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const entry = await page.evaluate(() => ({ key: history.state.kupuaKey, length: history.length }));
    const before = await counts(page);
    await rail.getByRole("button", { name: "View original image" }).click();
    await expect(saved).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => new URLSearchParams(location.search).get("crop"))).toBeNull();
    expect(await page.evaluate(() => ({ key: history.state.kupuaKey, length: history.length }))).toEqual(entry);
    const after = await counts(page);
    for (const field of ["pageReads", "rankReads", "mapReads", "countReads", "mgetReads", "fullReads"] as const) expect(after[field]).toBe(before[field]);
    await saved.click();
    await expect(saved).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Next image", exact: true }).click();
    await expect(page.locator("[data-detail-image-id]")).not.toHaveAttribute("data-detail-image-id", "local-0");
    expect(await page.evaluate(() => new URLSearchParams(location.search).get("crop"))).toBeNull();
  });

  test("image actions share selection targets and fit desktop and mobile", async ({ page }) => {
    const mediaOrigin = "https://api.media.local.dev-gutools.co.uk";
    const cropper = "https://cropper.media.local.dev-gutools.co.uk";
    const dimensions = { width: 700, height: 576 };
    const source = `${mediaOrigin}/images/local-0`;
    const crop = { id: "0_0_700_576", date: "2026-11-26T12:34:56.123Z",
      assets: [{ dimensions, mimeType: "image/jpeg", file: `${origin}/__publication-media/test.jpg` }],
      specification: { uri: source, type: "full", bounds: { x: 0, y: 0, ...dimensions } } };
    let cropPosts = 0;
    let projected = false;
    await page.route(`${origin}/api`, route => route.fulfill({ json: { data: {}, links: [
      { rel: "archive", href: "https://metadata.example.test/metadata/{id}/archived" },
      { rel: "cropper", href: cropper },
    ] } }));
    await page.route(`${origin}/grid-local-cropper/`, route => route.fulfill({ json: { links: [{ rel: "crop", href: `${cropper}/crops` }] } }));
    await page.route(`${origin}/grid-local-cropper/crops`, route => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({ type: "full", source });
      cropPosts++;
      return route.fulfill({ json: crop });
    });
    await page.route(`${origin}/api/images/local-0`, async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.uri = source;
      body.links.push({ rel: "crops", href: `${cropper}/crops/local-0` });
      body.data.exports = projected ? [crop] : [];
      return route.fulfill({ response, json: body });
    });
    await page.route(/\/api\/images\/(?:mget|search-after|window)$/, async route => {
      const response = await route.fetch();
      const body = await response.json();
      for (const entity of body.data) {
        const imageId = entity.data.id;
        entity.actions = [{ name: "delete", method: "DELETE", href: `${origin}/api/images/${imageId}` }];
        entity.uri = `${mediaOrigin}/images/${imageId}`;
        entity.links.push({ rel: "crops", href: `${cropper}/crops/${imageId}` },
          { rel: "download", href: `${origin}/api/images/${imageId}/download` });
        const archived = imageId === "local-1";
        const kept = imageId === "local-2";
        entity.data.persisted = { value: archived || kept, reasons: archived ? ["archived"] : kept ? ["usage"] : [] };
        entity.data.userMetadata.data.archived = { data: archived };
        entity.data.exports = imageId === "local-1" ? [{ specification: { type: "full" } }] : imageId === "local-0" && projected ? [crop] : [];
      }
      await route.fulfill({ response, json: body });
    });
    await page.setViewportSize({ width: 1720, height: 960 });
    await page.goto(`${origin}/__readback?density=grid`);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-1"]));
    const actions = page.getByRole("group", { name: "Image actions", exact: true });
    await expect(actions.getByRole("button", { name: "Add to Library", exact: true })).toBeEnabled();
    await actions.getByRole("button", { name: "Share with URL", exact: true }).click();
    await expect(page.getByRole("link", { name: "Open link" })).toHaveAttribute("href", `${new URL(page.url()).origin}/search?nonFree=true&ids=local-0,local-1`);
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(Array.from({ length: 45 }, (_, index) => `local-${index}`)));
    const share = actions.getByRole("button", { name: "Share with URL", exact: true });
    await expect(share).toBeDisabled();
    await share.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(share).toBeFocused();
    await expect(share.getByText(/reduce to 44 or less/)).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "Open link" })).toHaveCount(0);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-1"]));
    await expect(actions.getByRole("button", { name: "Crop full frame", exact: true })).toBeDisabled();
    await actions.getByRole("button", { name: "Download", exact: true }).click();
    await expect(page.getByText("Not sent - Download", { exact: true })).toBeVisible();
    await actions.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(actions.getByRole("button", { name: "Confirm delete 2 images", exact: true })).toHaveClass(/bg-grid-error/);
    await actions.getByRole("button", { name: "Confirm delete 2 images", exact: true }).click();
    await expect(page.getByText("Not sent - Delete", { exact: true })).toBeVisible();
    await actions.getByRole("button", { name: "Add to Library", exact: true }).click();
    await expect(page.getByText("Not sent - Add to Library", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => [...(window as CommandWindow).__kupua_selection_store__.getState().selectedIds])).toEqual(["local-0", "local-1"]);
    const libraryWidth = async (name: string) => {
      const button = actions.getByRole("button", { name, exact: true });
      await expect(button.locator(".image-action-full")).toBeVisible();
      return (await button.boundingBox())!.width;
    };
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const addWidth = await libraryWidth("Add to Library");
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-2"]));
    expect(await libraryWidth("Kept in Library")).toBeCloseTo(addWidth);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-1"]));
    expect(await libraryWidth("Remove from Library")).toBeGreaterThan(addWidth);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-1"]));
    await page.setViewportSize({ width: 320, height: 852 });
    await page.getByRole("button", { name: "More image actions", exact: true }).click();
    const overflow = page.locator("[data-image-action-popup]");
    const overflowBox = (await overflow.boundingBox())!;
    expect(overflowBox.x).toBeGreaterThanOrEqual(0);
    expect(overflowBox.x + overflowBox.width).toBeLessThanOrEqual(320);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "More image actions", exact: true })).toBeFocused();

    const touch = await page.context().newCDPSession(page);
    try {
      await page.setViewportSize({ width: 393, height: 852 });
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
      await page.evaluate(() => localStorage.setItem("kupua-allow-editing", "true"));
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
      await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-1"]));
      const trigger = page.getByRole("button", { name: "2 selected — actions", exact: true });
      await trigger.click();
      await page.getByRole("group", { name: "Selection actions", exact: true }).getByRole("button", { name: "Crop full frame", exact: true }).click();
      expect(cropPosts).toBe(0);
      const confirm = page.getByRole("button", { name: "Confirm (1): full frame for 1 image", exact: true });
      await expect(confirm).toHaveAccessibleDescription("1 skipped");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Crop full frame", exact: true }).click();
      expect(cropPosts).toBe(0);
      await confirm.click();
      const progress = page.getByRole("progressbar", { name: "Updating selected images" });
      await expect(progress).toHaveAttribute("aria-valuetext", "0 of 1 confirmed");
      expect(cropPosts).toBe(1);
      projected = true;
      await expect(progress).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^\d+ issues?$/ })).toHaveCount(0);
      expect(cropPosts).toBe(1);
      for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
        await page.setViewportSize(viewport);
        await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
        await page.getByRole("button", { name: "2 selected — actions", exact: true }).click();
        const popup = page.getByRole("group", { name: "Selection actions", exact: true });
        const checkAlignment = async (label: string) => {
          const button = popup.getByRole("button", { name: label, exact: true });
          const offset = await button.evaluate((el, text) => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode()) && node.textContent !== text) {}
            const range = document.createRange(); range.selectNodeContents(node!);
            const line = range.getClientRects()[0], icon = el.querySelector("svg")!.getBoundingClientRect();
            return Math.abs(icon.top + icon.height / 2 - line.top - line.height / 2);
          }, label);
          expect(offset).toBeLessThanOrEqual(2);
        };
        await checkAlignment("Add to Library");
        const box = (await popup.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        await popup.getByRole("button", { name: "Share with URL", exact: true }).click();
        await expect(popup).toHaveCount(0);
        await expect(page.getByRole("button", { name: "2 selected — actions", exact: true })).toBeFocused();
        if (viewport.width === 393) {
          await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-1"]));
          await page.getByRole("button", { name: "1 selected — actions", exact: true }).click();
          await checkAlignment("Remove from Library");
          await popup.getByRole("button", { name: "Share with URL", exact: true }).click();
          await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-1"]));
        }
      }
    } finally { await touch.detach(); }
    expect((await counts(page)).fakeDispatches).toBe(0);
    expect((await counts(page)).unexpected).toEqual([]);
  });

  test("status bar budgets labels around badges on desktop and mobile", async ({ page }, testInfo) => {
    const touch = await page.context().newCDPSession(page);
    const setStatusCounts = (total: number, badges: boolean, pool: number | null = null, tickerValues?: number[]) => page.evaluate(async ({ total, badges, pool, tickerValues, modulePath }) => {
      const { gridConfig } = await import(modulePath);
      const values: { name: string; value: number }[] = badges ? gridConfig.tickerDefinitions.slice(0, 3)
        .map((ticker: { name: string }, index: number) => ({ name: ticker.name, value: tickerValues?.[index] ?? (total < 10 ? index + 1 : 1_234_567 + index) })) : [];
      (window as CommandWindow).__kupua_store__.setState({ total, aiPoolTotal: pool, newCount: 0, newCountSince: null,
        tickerCounts: badges ? Object.fromEntries(values.map(({ name, value }) => [name, { value }])) : null });
      return values;
    }, { total, badges, pool, tickerValues, modulePath: "/src/lib/grid-config.ts" });
    try {
      await page.setViewportSize({ width: 393, height: 852 });
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await page.goto(`${origin}/__readback?density=grid`);
      await page.waitForFunction(() => !(window as CommandWindow).__kupua_store__.getState()._isInitialLoad
        && !(window as CommandWindow).__kupua_store__.getState().loading);
      await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
      const summary = page.getByTestId("result-summary");
      const bar = summary.locator("..");
      const matches = summary.getByText("matches", { exact: true });
      const controlsFit = () => expect.poll(() => bar.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.scrollWidth <= element.clientWidth + 1 && [...element.children].every(child => {
          const box = child.getBoundingClientRect();
          return !box.width || box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
        });
      })).toBe(true);
      const fits = async () => {
        await expect.poll(() => summary.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await controlsFit();
      };
      const retainedBadges = async (values: { name: string; value: number }[]) => {
        await expect(summary.locator("button")).toHaveCount(values.length);
        for (const { name, value } of values) {
          const badge = summary.getByRole("button", { name: `${value.toLocaleString()} ${name}`, exact: true });
          await expect(badge).toBeVisible();
          await expect(badge).toContainText(value.toLocaleString());
        }
      };
      await setStatusCounts(6, false);
      await expect(matches).toBeVisible();
      await fits();
      await page.screenshot({ path: testInfo.outputPath("status-mobile-roomy.png") });
      const mobileBadges = await setStatusCounts(9_000_000, true, null, [67_890, 987_654]);
      await expect(matches).toBeHidden();
      await expect(summary.locator(".status-badge-short:visible")).toHaveText(["GNM", "agency"]);
      await expect(summary.locator(".status-badge-full:visible")).toHaveCount(0);
      await retainedBadges(mobileBadges);
      await fits();
      await page.screenshot({ path: testInfo.outputPath("status-mobile-crowded.png") });
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.setViewportSize({ width: 1163, height: 856 });
      await expect(page.locator("html")).toHaveAttribute("data-shell", "wide");
      await page.evaluate(() => (window as CommandWindow).editorFixture.select(
        Array.from({ length: 6 }, (_, index) => `local-${index}`)));
      const desktopBadges = await setStatusCounts(99_999_999, true);
      const actions = bar.locator('.image-actions[data-surface="search"]');
      const share = actions.getByRole("button", { name: "Share with URL" });
      await expect(share.locator(".image-action-full")).toBeHidden();
      await expect(share.locator(".image-action-short")).toBeHidden();
      await retainedBadges(desktopBadges);
      await expect(summary.getByRole("status")).toContainText("99,999,999");
      await fits();
      await page.screenshot({ path: testInfo.outputPath("status-desktop-crowded.png") });
      await share.focus();
      await page.setViewportSize({ width: 1800, height: 856 });
      await expect(share.locator(".image-action-full")).toBeVisible();
      await expect(summary.locator(".status-badge-full:visible")).toHaveCount(desktopBadges.length);
      await expect(share).toBeFocused();
      await fits();
      await page.setViewportSize({ width: 1163, height: 856 });
      await expect(share.locator(".image-action-full")).toBeHidden();
      await expect(share.locator(".image-action-short")).toBeHidden();
      await expect(share).toBeFocused();
      await fits();
      const settled = await bar.evaluate(async element => {
        const modes: (string | null)[] = [];
        for (let frame = 0; frame < 8; frame++) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          modes.push(element.getAttribute("data-status-fit"));
        }
        return new Set(modes).size === 1;
      });
      expect(settled).toBe(true);
      await expect(share).toBeFocused();
      await page.setViewportSize({ width: 320, height: 852 });
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
      const fallbackBadges = await setStatusCounts(200, true, 9_000_000);
      await retainedBadges(fallbackBadges);
      await expect(matches).toBeHidden();
      await expect(summary.locator(".status-badge-label:visible")).toHaveCount(0);
      await expect(summary.getByRole("status")).toContainText("Best 200 of 9,000,000");
      await expect.poll(() => summary.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(1);
      await summary.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      await expect(summary.locator("button").last()).toBeInViewport();
      await controlsFit();
      await expect(bar.getByRole("button", { name: /Browse panel/ })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Grid view", exact: true })).toBeVisible();
    } finally {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await touch.detach();
    }
  });

  test("Unit D End reacquires a tail window and Home recovers observed bodies", async ({ page }) => {
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
    await page.goto(`${origin}/__readback?density=grid`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.simulateReadback(["local-0"], "unknown"))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts[0]?.items[0].observation)).toBe("observed");
    const seek = await page.evaluateHandle(() => {
      const job = { complete: false, error: null as string | null, pending: Promise.resolve() };
      job.pending = (window as CommandWindow).__kupua_store__.getState().seek(119).then(
        () => { job.complete = true; },
        error => { job.error = String(error); },
      );
      return job;
    });
    await waitForFixtureSetup(page, seek);
    await expect(region.locator('[data-cell-id="local-119"]')).toBeVisible();
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { offset: state.bufferOffset, ids: state.results.map(image => image?.id), total: state.total };
    })).toEqual({ offset: 19, ids: Array.from({ length: 101 }, (_, index) => `local-${index + 19}`), total: 120 });
    await page.keyboard.press("Home");
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await expect(region.locator('[data-cell-id="local-0"]')).toContainText("Readback local-0");
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts[0].items[0].state)).toBe("unknown");
    expect((await counts(page)).unexpected).toEqual([]);
  });

  for (const seed of [17, 43, 101, 211]) {
    test(`Unit D bounded sequence seed ${seed}`, async ({ page }) => {
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
      await page.goto(`${origin}/__readback?density=grid`);
      let density: "grid" | "table" | "justified" = "grid";
      const region = () => page.getByRole("region", { name: `Image results ${density}`, exact: true });
      await expect(region().locator('[data-cell-id="local-0"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().results.length)).toBe(120);
      const expectedIds = Array.from({ length: 120 }, (_, index) => `local-${index}`);
      let selected: string[] = [];
      const published: string[] = [];
      const trace: string[] = [];
      let exactActions = 0;
      let random = seed;
      const next = (limit: number) => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random % limit; };
      const initialReads = await counts(page);
      try {
        for (let cycle = 0; cycle < 4; cycle++) {
          const actions = ["scroll", "edge", "selection", "density", "publication", "history"];
          for (let index = actions.length - 1; index > 0; index--) {
            const swap = next(index + 1);
            [actions[index], actions[swap]] = [actions[swap], actions[index]];
          }
          for (const action of actions) {
            trace.push(`${trace.length + 1}:${action}`);
            if (action === "scroll") {
              const box = (await region().boundingBox())!;
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.mouse.wheel(0, next(2) ? 420 : -420);
            } else if (action === "edge") {
              await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
              const key = next(2) ? "Home" : "End";
              trace[trace.length - 1] += `:${key}`;
              await page.keyboard.press(key);
              exactActions++;
              await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
              await expect(region().locator(`[data-cell-id="local-${key === "Home" ? 0 : 119}"]`)).toBeInViewport();
            } else if (action === "selection") {
              selected = [`local-${100 + next(10)}`, `local-${110 + next(10)}`];
              trace[trace.length - 1] += `:${selected.join(",")}`;
              await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), selected);
              await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().isReconciling)).toBe(false);
            } else if (action === "density") {
              density = (["grid", "table", "justified"] as const)[next(3)];
              const button = await getDensityChangeButton(page, density);
              if (button) await button.click();
              await expect(region()).toBeVisible();
            } else if (action === "publication") {
              const id = `local-${60 + cycle}`;
              trace[trace.length - 1] += `:${id}`;
              await runReadbackAction(page, "holdReadbackSearch");
              await expect.poll(async () => (await counts(page)).held).toBe(1);
              const beforeReads = await counts(page);
              const before = await page.evaluateHandle(() => {
                const state = (window as CommandWindow).__kupua_store__.getState();
                const region = document.querySelector('[role="region"][aria-label^="Image results"]')!;
                const bounds = region.getBoundingClientRect();
                return { results: state.results, positions: state.imagePositions, offset: state.bufferOffset,
                  seek: state._seekGeneration, reset: state._scrollReset, focus: state.focusedImageId,
                  boxes: [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
                    const box = cell.getBoundingClientRect(); return box.bottom > bounds.top && box.top < bounds.bottom;
                  }).map(cell => ({ id: cell.dataset.cellId!, box: cell.getBoundingClientRect().toJSON() })) };
              });
              try {
                expect(await page.evaluate(id => (window as CommandWindow).editorFixture.simulateReadback([id], "unknown"), id)).toBe(true);
                await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
                const stable = await before.evaluate((before, id) => {
                  const state = (window as CommandWindow).__kupua_store__.getState();
                  return { references: before.results.every((image, index) => image?.id === id || image === state.results[index]),
                    positions: state.imagePositions === before.positions, offset: state.bufferOffset === before.offset,
                    seek: state._seekGeneration === before.seek, reset: state._scrollReset === before.reset,
                    focus: state.focusedImageId === before.focus,
                    boxes: before.boxes.length > 0 && before.boxes.every(({ id, box }) => {
                      const current = document.querySelector(`[data-cell-id="${id}"]`)?.getBoundingClientRect();
                      return current && ["x", "y", "width", "height"].every(axis => Math.abs(current[axis as "x"] - box[axis]) <= 1);
                    }) };
                }, id);
                expect(stable).toEqual({ references: true, positions: true, offset: true, seek: true, reset: true, focus: true, boxes: true });
                const afterReads = await counts(page);
                const observerBudget = (reads: typeof afterReads) => expect([
                  reads.mgetReads - beforeReads.mgetReads, reads.fakeDispatches - beforeReads.fakeDispatches,
                  reads.fullReads - beforeReads.fullReads, reads.pageReads - beforeReads.pageReads,
                  reads.rankReads - beforeReads.rankReads, reads.mapReads - beforeReads.mapReads,
                  reads.countReads - beforeReads.countReads,
                ]).toEqual([1, 1, 0, 0, 0, 0, 0]);
                observerBudget(afterReads);
                if (cycle === 0) expect(() => observerBudget({ ...afterReads, mgetReads: afterReads.mgetReads + 1 })).toThrow();
              } finally { await before.dispose(); }
              await runReadbackAction(page, "releaseReadbackSearch");
              await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
              expect((await counts(page)).staleDelivered - beforeReads.staleDelivered).toBe(1);
              published.push(id);
            } else {
              await page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().clear());
              selected = [];
              const id = await region().evaluate(element => {
                const bounds = element.getBoundingClientRect();
                const image = [...element.querySelectorAll("[data-cell-id] img")].find(image => {
                  const box = image.getBoundingClientRect();
                  return box.height > 0 && box.top >= bounds.top && box.bottom <= bounds.bottom;
                });
                if (!image) throw new Error("No visible result thumbnail to open");
                return image.closest<HTMLElement>("[data-cell-id]")!.dataset.cellId!;
              });
              await region().locator(`[data-cell-id="${id}"] img`).locator("..").dblclick();
              await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", id);
              await page.goBack();
              await expect(page.locator("[data-detail-image-id]")).toHaveCount(0);
              await expect(region()).toBeVisible();
            }
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            const actual = await page.evaluate(() => {
              const app = window as CommandWindow;
              const state = app.__kupua_store__.getState();
              return { offset: state.bufferOffset, ids: state.results.map(image => image?.id), positions: state.results.map(image => image && state.imagePositions.get(image.id)),
                total: state.total, selected: [...app.__kupua_selection_store__.getState().selectedIds],
                published: state.results.filter(image => image?.userMetadata?.labels?.includes("A3 observed label")).map(image => image!.id),
                receipts: app.editorFixture.readbackSnapshot().receipts.map(receipt => receipt.items.map(item => ({ id: item.imageId, state: item.state, observation: item.observation }))) };
            });
            expect([0, 19]).toContain(actual.offset);
            expect(actual).toEqual({ offset: actual.offset, ids: expectedIds.slice(actual.offset), positions: expectedIds.map((_, index) => index).slice(actual.offset), total: 120, selected,
              published, receipts: published.map(id => [{ id, state: "unknown", observation: "observed" }]) });
            const reads = await counts(page);
            expect(reads.unexpected).toEqual([]);
            expect(reads.held).toBe(0);
            expect(reads.pageReads - initialReads.pageReads).toBeGreaterThanOrEqual(published.length);
            expect(reads.pageReads - initialReads.pageReads).toBeLessThanOrEqual(published.length + exactActions * 2);
            expect([reads.rankReads, reads.mapReads]).toEqual([0, 0]);
            expect(reads.countReads - initialReads.countReads).toBeLessThanOrEqual(published.length + exactActions);
          }
        }
        console.log(`Unit D seed ${seed}: ${trace.join(" | ")}`);
      } catch (error) {
        console.error(`Unit D failed seed ${seed}: ${trace.join(" | ")}`);
        throw error;
      }
    });
  }

  test("Unit C T3 removes explicit deletion from five images fitting the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 5 } });
    await page.goto(`${origin}/__continuation?density=grid`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator("[data-cell-id]")).toHaveCount(5);
    await expect.poll(() => region.evaluate(region => {
      const bounds = region.getBoundingClientRect();
      return region.scrollHeight <= region.clientHeight && [...region.querySelectorAll("[data-cell-id]")].every(cell => {
        const box = cell.getBoundingClientRect();
        const image = cell.querySelector("img");
        return box.top >= bounds.top && box.bottom <= bounds.bottom && image?.complete && image.naturalWidth > 0;
      });
    })).toBe(true);
    await region.locator('[data-cell-id="local-3"] div[title^="Original "]').click();
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBe("local-3");
    const before = await counts(page);
    const retained = (await region.locator('[data-cell-id="local-2"]').boundingBox())!;
    await page.evaluate(() => (window as CommandWindow).editorFixture.publish("local-2", "reviewed"));
    await expect(region.locator('[data-cell-id="local-2"]')).toContainText("A2 published description");
    await expect(region.locator("[data-cell-id]")).toHaveCount(5);
    expect(await region.locator('[data-cell-id="local-2"]').boundingBox()).toEqual(retained);
    await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-1"));
    await expect(region.locator("[data-cell-id]")).toHaveCount(4);
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { ids: state.results.map(image => image?.id), total: state.total, focus: state.focusedImageId };
    })).toEqual({ ids: ["local-0", "local-2", "local-3", "local-4"], total: 4, focus: "local-3" });
    expect(await counts(page)).toEqual(before);
    await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-3"));
    await expect(region.locator("[data-cell-id]")).toHaveCount(3);
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { total: state.total, focus: state.focusedImageId };
    })).toEqual({ total: 3, focus: null });
    expect(await counts(page)).toEqual(before);
  });

  for (const density of ["grid", "table", "justified"] as const) {
    test(`Unit C retains unavailable slot geometry in ${density}`, async ({ page }) => {
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
      await page.goto(`${origin}/__continuation?density=${density}`);
      const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
      const target = region.locator('[data-cell-id="local-1"]');
      await expect(target.locator("img")).toBeVisible();
      expect(await region.evaluate(region => region.scrollHeight > region.clientHeight)).toBe(true);
      const beforeReads = await counts(page);
      const boxes = await region.evaluate(region => {
        const bounds = region.getBoundingClientRect();
        return [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
          const box = cell.getBoundingClientRect();
          return box.bottom > bounds.top && box.top < bounds.bottom;
        }).map(cell => ({ id: cell.dataset.cellId!, box: cell.getBoundingClientRect().toJSON() }));
      });
      if (density === "grid") {
        const original = (await target.boundingBox())!;
        await target.evaluate(target => { target.style.transform = "translateX(4px)"; });
        expect(Math.abs((await target.boundingBox())!.x - original.x)).toBeGreaterThan(1);
        await target.evaluate(target => { target.style.transform = ""; });
      }
      await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-1", "unavailable"));
      await expect(target).toContainText("Image unavailable");
      await expect(target.locator("img, button, input, [data-loading-placeholder]")).toHaveCount(0);
      for (const retained of boxes) {
        const actual = (await region.locator(`[data-cell-id="${retained.id}"]`).boundingBox())!;
        for (const axis of ["x", "y", "width", "height"] as const) expect(Math.abs(actual[axis] - retained.box[axis])).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return { total: state.total, length: state.results.length, position: state.imagePositions.get("local-1") };
      })).toEqual({ total: 120, length: 120, position: 1 });
      expect(await counts(page)).toEqual(beforeReads);
    });
  }

  test("Unit C keeps detail truthful and density stable across held reacquisition", async ({ page }) => {
    await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 120 } });
    await page.goto(`${origin}/__continuation?density=grid`);
    const grid = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(grid.locator('[data-cell-id="local-0"]')).toBeVisible();
    await grid.locator('[data-cell-id="local-0"] div[title^="Original "]').dblclick();
    await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", "local-0");
    await page.evaluate(() => {
      const fixture = (window as CommandWindow).editorFixture;
      fixture.publishUnavailable("local-0", "deleted");
      fixture.publishUnavailable("local-1", "unavailable");
    });
    const detail = page.locator("[data-detail-image-id]");
    await expect(detail.getByText("Image deleted", { exact: true })).toBeVisible();
    await expect(detail.getByTestId("detail-image-container").locator("img")).toHaveCount(0);
    await page.getByRole("button", { name: "Next image", exact: true }).click();
    await expect(detail).toHaveAttribute("data-detail-image-id", "local-2");
    await expect(detail.getByTestId("detail-image-container").locator("img")).toBeVisible();
    await page.getByRole("button", { name: "Back to search", exact: true }).click();
    await runReadbackAction(page, "holdReadbackSearch");
    await expect.poll(async () => (await counts(page)).held).toBe(1);
    const tableButton = await getDensityChangeButton(page, "table");
    await tableButton!.click();
    const table = page.getByRole("region", { name: "Image results table", exact: true });
    await expect(table.locator('[data-cell-id="local-3"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.publishUnavailable("local-3", "unavailable"));
    await expect(table.locator('[data-cell-id="local-3"]')).toContainText("Image unavailable");
    await page.getByRole("button", { name: "Release old search", exact: true }).click();
    await expect.poll(async () => (await counts(page)).held).toBe(0);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
    await expect(table.locator('[data-cell-id="local-3"]')).toContainText("Image unavailable");
    await expect(table.locator('[data-cell-id="local-0"]')).toContainText("Image deleted");
    const justified = await getDensityChangeButton(page, "justified");
    await justified!.click();
    await expect(page.getByRole("region", { name: "Image results justified", exact: true }).locator('[data-cell-id="local-3"]')).toContainText("Image unavailable");
    expect((await counts(page)).unexpected).toEqual([]);
  });

  for (const arm of ["unchanged", "distant edit", "interrupted detector"] as const) {
    test(`preserves active lookahead: ${arm}`, async ({ page }) => {
      await page.goto(`${origin}/__continuation?density=grid`);
      const region = page.getByRole("region", { name: "Image results grid", exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      await page.evaluate(() => (window as CommandWindow).editorFixture.seedContinuation());
      await expect(region.locator('[data-cell-id="local-4000650"]')).toBeVisible();
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const before = await counts(page);
      const probe = await page.evaluateHandle(async () => {
        const path = "/src/lib/scroll-geometry-ref.ts";
        const { getLayoutGeometry } = await import(path);
        const store = (window as CommandWindow).__kupua_store__;
        const retained = store.getState();
        const region = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
        let frames = 0;
        let comparisons = 0;
        let jumps = 0;
        let frameId = 0;
        let prior = new Map<string, { x: number; y: number; width: number; height: number }>();
        const deadline = performance.now() + 30_000;
        const sample = () => {
          frames++;
          const geometry = getLayoutGeometry();
          const offset = Math.floor(store.getState().bufferOffset / geometry.columns) * geometry.rowHeight;
          const bounds = region.getBoundingClientRect();
          const current = new Map<string, { x: number; y: number; width: number; height: number }>();
          for (const cell of region.querySelectorAll<HTMLElement>("[data-cell-id]")) {
            const box = cell.getBoundingClientRect();
            if (box.bottom <= bounds.top || box.top >= bounds.bottom) continue;
            const next = { x: box.x, y: box.y + region.scrollTop + offset, width: box.width, height: box.height };
            const previous = prior.get(cell.dataset.cellId!);
            if (previous) {
              comparisons++;
              if (Object.keys(next).some(key => Math.abs(next[key as keyof typeof next] - previous[key as keyof typeof next]) > 1)) jumps++;
            }
            current.set(cell.dataset.cellId!, next);
          }
          prior = current;
          if (performance.now() < deadline) frameId = requestAnimationFrame(sample);
        };
        frameId = requestAnimationFrame(sample);
        return { stop() {
          cancelAnimationFrame(frameId);
          const current = store.getState();
          return { frames, comparisons, jumps, expired: performance.now() >= deadline,
            survivors: retained.results.slice(400).every(image => image && current.results.includes(image)
              && current.imagePositions.get(image.id) === retained.imagePositions.get(image.id)) };
        } };
      });
      const wheelUntil = async (ready: () => Promise<boolean>, delta: number) => {
        for (let step = 0; step < 40; step++) {
          if (await ready()) return;
          await page.mouse.wheel(0, delta);
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        }
        throw new Error("Bounded wheel journey did not reach its boundary");
      };
      try {
        await page.request.post(`${origin}/__readback-control`, { data: { action: "hold" } });
        await wheelUntil(async () => (await counts(page)).held === 1, 1200);
        expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState()._extendForwardInFlight)).toBe(true);
        if (arm !== "unchanged") {
          await page.evaluate(interrupt => (window as CommandWindow).editorFixture.simulateContinuation(1, interrupt), arm === "interrupted detector");
          await page.mouse.wheel(0, 120);
          await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
        }
        const atPublication = await counts(page);
        const useful = atPublication.held === 1 && atPublication.aborted === 0;
        expect(useful).toBe(arm !== "interrupted detector");
        if (arm !== "unchanged") expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().dispatchHadLookahead)).toBe(useful);
        if (arm === "interrupted detector") return;
        await page.request.post(`${origin}/__readback-control`, { data: { action: "release" } });
        await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().bufferOffset)).toBe(4_000_200);
        await wheelUntil(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().bufferOffset >= 4_000_400), 1200);
        await wheelUntil(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().bufferOffset < 4_000_400), -2400);
        const result = await probe.evaluate(probe => probe.stop());
        expect(result).toMatchObject({ expired: false, survivors: true, jumps: 0 });
        expect(result.comparisons).toBeGreaterThan(12);
        const after = await counts(page);
        expect(after.pageReads - before.pageReads).toBe(3);
        expect([after.rankReads - before.rankReads, after.countReads - before.countReads, after.mapReads - before.mapReads]).toEqual([0, 0, 0]);
        expect(after.unexpected).toEqual([]);
        expect(await page.evaluate(() => {
          const state = (window as CommandWindow).__kupua_store__.getState();
          return { length: state.results.length, total: state.total, offset: state.bufferOffset };
        })).toEqual({ length: 1000, total: 9_000_000, offset: 4_000_200 });
      } finally { await probe.evaluate(probe => probe.stop()); await probe.dispose(); }
    });
  }

  for (const total of [1000, 65000]) {
    test(`discovers new tail matches without switching the ${total} tier`, async ({ page }) => {
      const density = total === 1000 ? "grid" : "justified";
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: total + 1, matching: total } });
      await page.goto(`${origin}/__continuation?density=${density}&tail`);
      const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return !state.loading && !state.positionMapLoading && !state._extendForwardInFlight &&
          (state.total > 1000 || state.results.length === state.total);
      })).toBe(true);
      await page.evaluate(total => (window as CommandWindow).editorFixture.seedContinuation(total - 1000, total - 1000, 1000, 999), total);
      const last = region.locator(`[data-cell-id="local-${total - 1}"]`);
      await expect(last).toBeVisible();
      await page.evaluate(total => (window as CommandWindow).editorFixture.simulateContinuation(1, false, total), total);
      await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
      const pollSince = await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().newCountSince);
      let arrivalPolls = 0;
      await page.route("**/api/images/count", async route => {
        if (pollSince && route.request().postDataJSON().since === pollSince) {
          arrivalPolls++;
          await route.fulfill({ json: { total: 0 } });
        } else await route.fallback();
      });
      const before = await counts(page);
      const retainedBox = (await last.boundingBox())!;
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect.poll(() => arrivalPolls).toBeGreaterThan(0);
      if (total === 1000) {
        await last.locator('div[title^="Readback "]').dblclick();
        await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", `local-${total - 1}`);
        await page.getByRole("button", { name: "Next image", exact: true }).click();
        await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", `local-${total}`);
        await page.getByRole("button", { name: "Back to search", exact: true }).click();
      } else {
        const box = (await region.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 1);
      }
      await expect.poll(() => page.evaluate(total => (window as CommandWindow).__kupua_store__.getState().imagePositions.get(`local-${total}`), total)).toBe(total);
      await expect(page.getByTestId("scrubber-track")).toHaveAttribute("data-scrubber-mode", total === 1000 ? "buffer" : "indexed");
      if (total === 65000) {
        const afterBox = (await last.boundingBox())!;
        for (const axis of ["x", "y", "width", "height"] as const) expect(Math.abs(afterBox[axis] - retainedBox[axis])).toBeLessThanOrEqual(1);
        await page.mouse.wheel(0, 800);
      }
      await expect(region.locator(`[data-cell-id="local-${total}"] img`)).toBeVisible();
      expect(await page.evaluate(() => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return { total: state.total, length: state.results.length, extent: state._displayEnd };
      })).toEqual({ total, length: 1000, extent: total + 1 });
      const after = await counts(page);
      expect(after.pageReads - before.pageReads).toBeGreaterThanOrEqual(1);
      expect(after.pageReads - before.pageReads).toBeLessThanOrEqual(2);
      expect([after.rankReads - before.rankReads, after.countReads - before.countReads, after.mapReads - before.mapReads]).toEqual([0, 0, 0]);
      expect(after.unexpected).toEqual([]);
      if (total === 65000) {
        const target = region.locator(`[data-cell-id="local-${total}"]`);
        await target.locator('div[title^="Readback "]').click();
        const departure = (await target.boundingBox())!;
        for (const density of ["table", "grid", "justified"] as const) {
          const button = await getDensityChangeButton(page, density);
          if (button) await button.click();
          await expect(page.getByRole("region", { name: `Image results ${density}`, exact: true })
            .locator(`[data-cell-id="local-${total}"]`)).toBeVisible();
        }
        const restored = (await target.boundingBox())!;
        for (const axis of ["x", "y", "width", "height"] as const) expect(Math.abs(restored[axis] - departure[axis])).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBe(`local-${total}`);
      }
    });
  }

  test("restores history identity and placement despite an invalid hint, then refuses a missing anchor", async ({ page }) => {
    await page.goto(`${origin}/__continuation?density=grid`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.seedContinuation());
    const target = region.locator('[data-cell-id="local-4000650"]');
    await expect(target).toBeVisible();
    await target.locator('div[title^="Original local-4000650"]').click();
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBe("local-4000650");
    await page.evaluate(() => (window as CommandWindow).editorFixture.simulateContinuation());
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
    const beforeTop = (await target.boundingBox())!.y - (await region.boundingBox())!.y;
    const destinationKey = await page.evaluate(async () => {
      const path = "/src/lib/orchestration/search.ts";
      const { pushNavigate } = await import(path);
      const key = history.state.kupuaKey as string;
      const app = window as CommandWindow & { __kupua_router__: { navigate: (options: unknown) => unknown } };
      pushNavigate(app.__kupua_router__.navigate, { to: "/search", search: { nonFree: "true" } });
      return key;
    });
    await expect.poll(() => page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return state.params.query === undefined && !state.loading && state.sortAroundFocusStatus === null;
    })).toBe(true);
    await page.keyboard.press("Home");
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(async key => {
      const path = "/src/lib/history-snapshot.ts";
      const { snapshotStore } = await import(path);
      const snapshot = snapshotStore.get(key);
      if (snapshot?.anchorImageId !== "local-4000650") throw new Error("Destination snapshot was not captured");
      snapshotStore.set(key, { ...snapshot, anchorOffset: Number.MAX_SAFE_INTEGER });
    }, destinationKey);
    const beforeBack = await counts(page);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState()._searchContinuity?.phase)).toBe("placed");
    await expect(target).toBeVisible();
    expect(Math.abs((await target.boundingBox())!.y - (await region.boundingBox())!.y - beforeTop)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return { focus: state.focusedImageId, position: state.imagePositions.get("local-4000650"), query: state.params.query };
    })).toEqual({ focus: "local-4000650", position: 4_000_649, query: "-label:reviewed" });
    expect((await counts(page)).rankReads - beforeBack.rankReads).toBe(1);
    await page.goForward();
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.simulateContinuation(1, false, 4_000_650));
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().receipts.at(-1)?.items[0].observation)).toBe("observed");
    await page.goBack();
    await expect.poll(() => page.evaluate(() => {
      const state = (window as CommandWindow).__kupua_store__.getState();
      return state.params.query === "-label:reviewed" && !state.loading && state.sortAroundFocusStatus === null;
    })).toBe(true);
    await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
    expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().focusedImageId)).toBeNull();
    expect((await counts(page)).unexpected).toEqual([]);
  });

  for (const scenario of [{ density: "table", direction: "start" }, { density: "grid", direction: "end" }, { density: "justified", direction: "end" }] as const) {
    test(`presents the ${scenario.direction} boundary in ${scenario.density} without loading holes`, async ({ page }) => {
      await page.request.post(`${origin}/__readback-control`, { data: { action: "reset", total: 12_000 } });
      await page.goto(`${origin}/__continuation?density=${scenario.density}`);
      const region = page.getByRole("region", { name: `Image results ${scenario.density}`, exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      await page.request.post(`${origin}/__readback-control`, { data: { action: "exclude-prefix", count: 332 } });
      await page.evaluate(direction => (window as CommandWindow).editorFixture.seedContinuation(
        direction === "start" ? 332 : 10_800, direction === "start" ? 332 : 11_132, 1000, direction === "start" ? 5 : 800), scenario.direction);
      const box = (await region.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, scenario.direction === "start" ? -500 : 1000);
      await expect.poll(() => page.evaluate(direction => {
        const state = (window as CommandWindow).__kupua_store__.getState();
        return direction === "start" ? Boolean(state._terminalStart) : Boolean(state._terminalEnd);
      }, scenario.direction)).toBe(true);
      await page.mouse.wheel(0, scenario.direction === "start" ? -100_000 : 100_000);
      await expect(region.getByRole("status")).toHaveText(scenario.direction === "start" ? "Start of results" : "End of results");
      expect(await region.locator("[data-loading-placeholder]").count()).toBe(0);
      expect(await page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().total)).toBe(12_000);
      expect((await counts(page)).unexpected).toEqual([]);
    });
  }
});

test("A3 canonical readback survives a released stale API page across all densities", async ({ page }, testInfo) => {
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_MEDIA_DELIVERY: "canonical" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"),
    plugins: [gridMutationPlugin("readback")], server: { host: "127.0.0.1", port: 0 } });
  const escaped: string[] = [];
  try {
    await vite.listen();
    const origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      escaped.push(url.pathname);
      return route.abort();
    });
    await page.goto(`${origin}/__readback`);
    const grid = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(grid.locator('[data-cell-id="local-0"]')).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["local-0", "local-offscreen"]));
    const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot());
    await expect.poll(async () => (await snapshot()).selected.map(image => image.labels)).toEqual([["original label"], ["original label"]]);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().isReconciling)).toBe(false);
    await page.getByRole("button", { name: "Hold old search", exact: true }).click();
    const counts = () => page.evaluate(async () => (await fetch("/__readback-control")).json()) as Promise<{
      searchReads: number; mgetReads: number; fakeDispatches: number; staleDelivered: number; held: number; unexpected: string[];
    }>;
    await expect.poll(async () => (await counts()).held).toBe(1);
    const beforeReads = (await counts()).mgetReads;
    const publication = await page.evaluate(async () => {
      const app = window as CommandWindow;
      const source = app.__kupua_store__;
      const selected = app.__kupua_selection_store__;
      const before = source.getState();
      const selection = selected.getState();
      const geometryPath = "/src/lib/scroll-geometry-ref.ts";
      const { getLayoutGeometry } = await import(geometryPath);
      const geometry = getLayoutGeometry();
      const region = document.querySelector<HTMLElement>('[aria-label="Image results grid"]')!;
      const bounds = region.getBoundingClientRect();
      const visible = [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
        const box = cell.getBoundingClientRect();
        return box.top >= bounds.top && box.bottom <= bounds.bottom;
      }).map(cell => ({ id: cell.dataset.cellId!, box: cell.getBoundingClientRect() }));
      let copies = 0;
      let displacement = 0;
      const unsubscribe = source.subscribe((next, previous) => { if (next.results !== previous.results) copies++; });
      try {
        if (!app.editorFixture.simulateReadback()) throw new Error("Simulation refused");
        const deadline = performance.now() + 12_000;
        let observed = false;
        while (!observed && performance.now() < deadline) {
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          for (const { id, box } of visible) {
            const cell = region.querySelector(`[data-cell-id="${id}"]`);
            if (!cell) throw new Error("Visible cell disappeared");
            const next = cell.getBoundingClientRect();
            displacement = Math.max(displacement, Math.abs(next.x - box.x), Math.abs(next.y - box.y), Math.abs(next.width - box.width), Math.abs(next.height - box.height));
          }
          observed = app.editorFixture.readbackSnapshot().receipts[0]?.items.every(item => item.observation === "observed") ?? false;
        }
        return { observed, copies, displacement, visible: visible.length, geometryRetained: getLayoutGeometry() === geometry,
          unchangedReferences: before.results.every((image, index) => image?.id === "local-0" || source.getState().results[index] === image),
          selectedRevision: selected.getState().metadataRevision - selection.metadataRevision,
          membershipRetained: selected.getState().selectedIds === selection.selectedIds && selected.getState().anchorId === selection.anchorId };
      } finally { unsubscribe(); }
    });
    expect(publication).toMatchObject({ observed: true, copies: 1, geometryRetained: true, unchangedReferences: true, selectedRevision: 1, membershipRetained: true });
    expect(publication.visible).toBeGreaterThan(1);
    expect(publication.displacement).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Release old search", exact: true }).click();
    await expect.poll(async () => (await counts()).staleDelivered).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_store__.getState().loading)).toBe(false);
    expect((await snapshot()).selected.map(image => image.labels)).toEqual([["A3 observed label"], ["A3 observed label"]]);
    for (const density of ["grid", "table", "justified"] as const) {
      await (await getDensityChangeButton(page, density))?.click();
      const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
      await expect(region.locator('[data-cell-id="local-0"]')).toBeVisible();
      if (density === "justified") await expect(region.locator('[data-cell-id="local-0"] [title]').first()).toHaveAttribute("title", /Readback local-0/);
      else await expect(region.locator('[data-cell-id="local-0"]')).toContainText("Readback local-0");
      await expect(page.getByRole("button", { name: "Remove A3 observed label from all selected images", exact: true })).toBeDisabled();
    }
    const after = await counts();
    expect(after.fakeDispatches).toBe(2);
    expect(after.mgetReads - beforeReads).toBeGreaterThanOrEqual(1);
    expect(after.mgetReads - beforeReads).toBeLessThanOrEqual(3);
    expect(after.held).toBe(0);
    expect(after.unexpected).toEqual([]);
    expect(escaped).toEqual([]);
    expect(await page.evaluate(async () => (await fetch("/es/_search", { method: "POST", body: "{}" })).status)).toBe(403);
    expect((await counts()).unexpected).toEqual(["POST /es/_search"]);
  } finally {
    await page.evaluate(() => (window as Partial<CommandWindow>).editorFixture?.disposeReadback()).catch(() => {});
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
    await vite.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

async function isolatePublicationFixture(page: Page, origin: string) {
  const escaped: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ["/api", "/api/", "/api/usage/quotas"].includes(url.pathname) && route.request().method() === "GET") {
      return route.fulfill({ json: { data: {}, links: [] } });
    }
    if (url.origin === origin && !/^\/(es|api|bedrock|grid-metadata|grid-auth)(\/|$)/.test(url.pathname)) return route.continue();
    escaped.push(url.pathname);
    return route.abort();
  });
  return escaped;
}

test("buffer publication uses the normal API app without fixture transforms", async ({ page }, testInfo) => {
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_MEDIA_DELIVERY: "canonical" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"),
    server: { host: "127.0.0.1", port: 0 } });
  const escaped: string[] = [];
  let pageReads = 0;
  try {
    await vite.listen();
    const origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
    const media = await readFile(resolve("../e2e-tests/fixtures/images/test.jpg"));
    const images = Array.from({ length: 120 }, (_, index) => ({
      uri: `${origin}/api/images/local-${index}`, links: [{ rel: "optimised", href: `${origin}/__trial-media.jpg` }],
      data: { id: `local-${index}`, uploadTime: new Date(Date.UTC(2026, 0, 1) - index * 1000).toISOString(),
        metadata: { description: `Original local image ${index}`, credit: "Fixture" },
        cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
        userMetadata: { data: { labels: { data: [{ data: "original label" }] }, archived: { data: false },
          metadata: {}, usageRights: {}, photoshoot: {} } },
        source: { dimensions: { width: 700, height: 576 }, mimeType: "image/jpeg" },
        thumbnail: { secureUrl: `${origin}/__trial-media.jpg`, dimensions: { width: 700, height: 576 } },
        usages: { data: [] }, leases: { data: { leases: [] } }, collections: [] },
    }));
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (url.origin === origin) {
        if (request.method() === "POST" && path === "/api/images/search-after") {
          pageReads++;
          return route.fulfill({ json: { data: images, total: images.length,
            sortValues: images.map(image => [Date.parse(image.data.uploadTime), image.data.id]) } });
        }
        if (request.method() === "POST" && path === "/api/images/count") {
          return route.fulfill({ json: { total: images.length } });
        }
        if (request.method() === "POST" && path === "/api/images/aggregations") {
          return route.fulfill({ json: { fields: {}, isFilterCounts: {} } });
        }
        if (request.method() === "GET") {
          if (path === "/__trial-media.jpg") return route.fulfill({ contentType: "image/jpeg", body: media });
          if (["/api", "/api/", "/api/usage/quotas"].includes(path)) return route.fulfill({ json: { data: {}, links: [] } });
          if (!/^\/(es|api|bedrock|grid-metadata|grid-auth)(\/|$)/.test(path)) return route.continue();
        }
      }
      escaped.push(`${request.method()} ${path}`);
      return route.abort();
    });
    await page.goto(`${origin}/search`);
    const region = page.getByRole("region", { name: "Image results grid", exact: true });
    await expect(region.locator("[data-cell-id]").first()).toBeVisible();
    expect(await page.evaluate(async () => {
      const path = "/src/dal/api-data-source.ts";
      const { ApiDataSource } = await import(path);
      return (window as CommandWindow).__kupua_store__.getState().dataSource instanceof ApiDataSource
        && !(window as Partial<CommandWindow>).editorFixture;
    })).toBe(true);
    await expect.poll(() => region.locator("img").first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 700)).toBe(true);
    await page.evaluate(async () => {
      const path = "/src/lib/image-publication.ts";
      const { publishImage } = await import(path);
      const image = (window as CommandWindow).__kupua_store__.getState().results[0]!;
      publishImage({ ...image, metadata: { ...image.metadata, description: "Published API image" } }, { resource: { links: [] } });
    });
    await expect(region.getByText("Published API image", { exact: true })).toBeVisible();
    await page.reload();
    await expect(region.locator("[data-cell-id]").first()).toBeVisible();
    await expect(region.getByText("Published API image", { exact: true })).toHaveCount(0);
    expect(pageReads).toBe(2);
    expect(escaped).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await page.unrouteAll({ behavior: "wait" });
    await vite.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test.describe("buffer publication", () => {
  let vite: Awaited<ReturnType<typeof createServer>>;
  let origin: string;
  const env = { VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_GRID_METADATA_ORIGIN: "https://metadata.example.test", VITE_MEDIA_DELIVERY: "canonical" };
  let previous: Record<string, string | undefined>;

  test.beforeAll(async ({}, testInfo) => {
    previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    vite = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"), plugins: [gridMutationPlugin(true)],
      server: { host: "127.0.0.1", port: 0 } });
    await vite.listen();
    origin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
  });
  test.afterAll(async () => {
    await vite?.close();
    for (const [key, value] of Object.entries(previous ?? {})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  for (const density of ["grid", "table", "justified"] as const) {
      test(`in ${density}: stable boxes and current consumers`, async ({ page }) => {
        const escaped = await isolatePublicationFixture(page, origin);
        try {
          await page.goto(`${origin}/__publication?density=${density}`);
          const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
          await expect(region).toBeVisible();
          await expect(region.locator("[data-cell-id]").first()).toBeVisible();
          await region.evaluate(element => { element.scrollTop = 1800; });
          await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(1000);
          let imageId = "";
          await expect.poll(async () => {
            imageId = await region.evaluate(element => {
              const bounds = element.getBoundingClientRect();
              const topInset = element.getAttribute("aria-label") === "Image results table" ? 40 : 0;
              const cell = [...element.querySelectorAll<HTMLElement>("[data-cell-id]")].find(cell => {
                const box = cell.getBoundingClientRect();
                return box.top >= bounds.top + topInset && box.bottom < bounds.bottom - 8;
              });
              return cell?.dataset.cellId ?? "";
            });
            return imageId;
          }).not.toBe("");
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.select([imageId]), imageId);
          const snapshot = () => page.evaluate(imageId => (window as CommandWindow).editorFixture.publicationSnapshot(imageId), imageId);
          await expect.poll(async () => (await snapshot()).selected).toBe(`Original ${imageId}`);
          await expect.poll(async () => (await snapshot()).reconciling).toBe(false);
          const cell = region.locator(`[data-cell-id="${imageId}"]`);
          await cell.scrollIntoViewIfNeeded();
          const observation = await page.evaluate(async ({ imageId, density }) => {
            const fixture = (window as CommandWindow).editorFixture;
            const path = "/src/lib/scroll-geometry-ref.ts";
            const { getLayoutGeometry } = await import(path);
            const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
            const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            for (let count = 0; count < 8; count++) await frame();
            const regionBox = region.getBoundingClientRect();
            const visible = [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].filter(cell => {
              const box = cell.getBoundingClientRect();
              return box.bottom > regionBox.top + 40 && box.top < regionBox.bottom;
            }).map(cell => cell.dataset.cellId!);
            const boxes = () => visible.map(id => {
              const cell = region.querySelector(`[data-cell-id="${CSS.escape(id)}"]`);
              if (!cell) throw new Error("A visible cell disappeared");
              const { x, y, width, height } = cell.getBoundingClientRect();
              return { id, x, y, width, height };
            });
            const before = boxes();
            const geometry = getLayoutGeometry();
            fixture.publish(imageId);
            const frames = [];
            for (let count = 0; count < 12; count++) { await frame(); frames.push(boxes()); }
            const deadline = performance.now() + 3000;
            while (fixture.publicationSnapshot(imageId).reconciling && performance.now() < deadline) {
              await frame();
              frames.push(boxes());
            }
            if (fixture.publicationSnapshot(imageId).reconciling) throw new Error("Publication reconciliation did not finish");
            return { before, frames, retainedGeometry: getLayoutGeometry() === geometry };
          }, { imageId, density });
          expect(observation.before.length).toBeGreaterThan(1);
          for (const frame of observation.frames) expect(frame).toEqual(observation.before);
          expect(observation.retainedGeometry).toBe(true);
          if (density === "justified") await expect(cell.locator("[title]").first()).toHaveAttribute("title", /A2 published description/);
          else await expect(cell).toContainText("A2 published description");
          await expect.poll(async () => (await snapshot()).selected).toBe("A2 published description");
          expect((await snapshot()).selectedIds).toEqual([imageId]);
          expect((await snapshot()).links).toBe(0);
          await expect(page.getByRole("button", { name: "Remove A2 published label", exact: true })).toBeDisabled();
          await cell.dblclick();
          await expect(page.getByText("Back to search", { exact: true })).toBeVisible();
          await expect(page.getByText("A2 published description", { exact: true }).filter({ visible: true }).first()).toBeVisible();
          await page.getByText("Back to search", { exact: true }).click();
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.revealPublicationTarget(imageId), imageId);
          await page.keyboard.press("f");
          await page.waitForFunction(() => document.fullscreenElement !== null);
          await expect(page.locator('[data-fullscreen-preview="active"] img')).toHaveAttribute("alt", "A2 published description");
          await page.evaluate(() => document.exitFullscreen());
          await expect(page.locator('[data-fullscreen-preview="active"]')).toHaveCount(0);
          const destination = density === "grid" ? "table" : "grid";
          const densityButton = await getDensityChangeButton(page, destination);
          await densityButton?.click();
          const nextRegion = page.getByRole("region", { name: `Image results ${destination}`, exact: true });
          await expect(nextRegion.locator(`[data-cell-id="${imageId}"]`)).toContainText("A2 published description");
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.select([imageId]), imageId);
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.acceptNewerPage(imageId), imageId);
          await expect.poll(async () => (await snapshot()).resident).toBe("A2 newer page description");
          await expect.poll(async () => (await snapshot()).selected).toBe("A2 newer page description");
          await expect.poll(async () => (await snapshot()).reconciling).toBe(false);
          expect((await snapshot()).links).toBe(1);
          await expect(page.getByRole("button", { name: "Remove A2 newer page label", exact: true })).toBeEnabled();
          expect((await snapshot()).selectedIds).toEqual([imageId]);
          const newerCell = nextRegion.locator(`[data-cell-id="${imageId}"]`);
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.revealPublicationTarget(imageId), imageId);
          await expect(newerCell).toContainText("A2 newer page description");
          await newerCell.dblclick();
          await expect(page.getByText("Back to search", { exact: true })).toBeVisible();
          await expect(page.getByText("A2 newer page description", { exact: true }).filter({ visible: true }).first()).toBeVisible();
          await page.getByText("Back to search", { exact: true }).click();
          await page.evaluate(imageId => (window as CommandWindow).editorFixture.select([imageId, "img-0"]), imageId);
          await expect.poll(async () => (await snapshot()).reconciling).toBe(false);
          await expect(page.getByRole("button", { name: "Remove A2 newer page label from all selected images", exact: true })).toBeEnabled();
          expect(escaped).toEqual([]);
        } finally {
          await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); }).catch(() => {});
          await page.unrouteAll({ behavior: "wait" });
        }
      });
  }

  for (const density of ["grid", "table", "justified"] as const) {
    test(`preserves ${density} browsing during publication`, async ({ page }) => {
      const escaped = await isolatePublicationFixture(page, origin);
      let probe: JSHandle<{ published: () => boolean; stop: () => unknown }> | undefined;
      try {
        await page.goto(`${origin}/__publication?density=${density}`);
        const region = page.getByRole("region", { name: `Image results ${density}`, exact: true });
        await expect(region.locator("[data-cell-id]").first()).toBeVisible();
        await region.evaluate(element => { element.scrollTop = 1600; });
        await expect.poll(() => region.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const images = [...element.querySelectorAll("img")].filter(image => {
            const box = image.getBoundingClientRect();
            return box.bottom > bounds.top && box.top < bounds.bottom;
          });
          return images.length > 0 && images.every(image => image.complete && image.naturalWidth >= 700);
        })).toBe(true);
        const bounds = (await region.boundingBox())!;
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        const initialScroll = await region.evaluate(element => element.scrollTop);
        await page.mouse.wheel(0, 200);
        await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(initialScroll);
        probe = await page.evaluateHandle(density => {
          const region = document.querySelector<HTMLElement>(`[aria-label="Image results ${density}"]`)!;
          const store = (window as CommandWindow).__kupua_store__;
          const startScroll = region.scrollTop;
          let frames = 0;
          let comparisons = 0;
          let jumps = 0;
          let wheelEvents = 0;
          let publicationRequested = false;
          let publicationObserved = false;
          let publicationDuringScroll = false;
          let movementAfterPublication = false;
          let scrollWrites = 0;
          let reverseMovement = 0;
          let lastMovement = -Infinity;
          let lastScroll = startScroll;
          const ownTop = Object.getOwnPropertyDescriptor(region, "scrollTop");
          const ownScrollTo = Object.getOwnPropertyDescriptor(region, "scrollTo");
          const nativeTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
          const nativeScrollTo = region.scrollTo;
          Object.defineProperty(region, "scrollTop", { configurable: true,
            get: () => nativeTop.get!.call(region) as number,
            set: (value: number) => { scrollWrites++; nativeTop.set!.call(region, value); } });
          region.scrollTo = (...args: unknown[]) => { scrollWrites++; Reflect.apply(nativeScrollTo, region, args); };
          region.scrollTop = startScroll;
          region.scrollTo({ top: startScroll });
          if (scrollWrites !== 2) throw new Error("Scroll-write detector missed its controls");
          scrollWrites = 0;
          let frameId = 0;
          let previous = new Map<string, { x: number; y: number; width: number; height: number }>();
          const wheel = () => { wheelEvents++; };
          region.addEventListener("wheel", wheel, { passive: true });
          const unsubscribe = store.subscribe((state, prior) => {
            if (!publicationObserved && state.results !== prior.results
              && state.results.some(image => image?.id === targetId && image.metadata.description === "A2 published description")) {
              publicationObserved = true;
              publicationDuringScroll = wheelEvents > 2 && region.scrollTop > startScroll && performance.now() - lastMovement < 200;
            }
          });
          const sample = () => {
            frames++;
            const scroll = region.scrollTop;
            const movedForward = scroll > lastScroll;
            if (movedForward) {
              lastMovement = performance.now();
              if (publicationObserved) movementAfterPublication = true;
            }
            if (scroll < lastScroll - 1) reverseMovement++;
            lastScroll = scroll;
            const bounds = region.getBoundingClientRect();
            const current = new Map<string, { x: number; y: number; width: number; height: number }>();
            for (const cell of region.querySelectorAll<HTMLElement>("[data-cell-id]")) {
              const box = cell.getBoundingClientRect();
              if (box.bottom <= bounds.top || box.top >= bounds.bottom) continue;
              const next = { x: box.x + region.scrollLeft, y: box.y + region.scrollTop, width: box.width, height: box.height };
              const before = previous.get(cell.dataset.cellId!);
              if (before) {
                comparisons++;
                if (Math.abs(next.x - before.x) > 1 || Math.abs(next.y - before.y) > 1
                  || Math.abs(next.width - before.width) > 1 || Math.abs(next.height - before.height) > 1) jumps++;
              }
              current.set(cell.dataset.cellId!, next);
            }
            previous = current;
            if (!publicationRequested && wheelEvents > 2 && movedForward) {
              publicationRequested = true;
              (window as CommandWindow).editorFixture.publish(targetId);
            }
            frameId = requestAnimationFrame(sample);
          };
          frameId = requestAnimationFrame(sample);
          const bounds = region.getBoundingClientRect();
          const target = [...region.querySelectorAll<HTMLElement>("[data-cell-id]")].find(cell => {
            const box = cell.getBoundingClientRect();
            return box.top >= bounds.top && box.bottom <= bounds.bottom;
          });
          if (!target) throw new Error("Visible publication target unavailable");
          const targetId = target.dataset.cellId!;
          return { published: () => publicationObserved, stop() {
            cancelAnimationFrame(frameId);
            unsubscribe();
            region.removeEventListener("wheel", wheel);
            if (ownTop) Object.defineProperty(region, "scrollTop", ownTop);
            else delete (region as Partial<HTMLElement>).scrollTop;
            if (ownScrollTo) Object.defineProperty(region, "scrollTo", ownScrollTo);
            else delete (region as Partial<HTMLElement>).scrollTo;
            return { frames, comparisons, jumps, wheelEvents, publicationDuringScroll, movementAfterPublication, scrollWrites, reverseMovement };
          } };
        }, density);
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        for (let step = 0; step < 8; step++) {
          await page.mouse.wheel(0, 40);
          // Observe publication during real movement before driving the remaining scroll.
          if (step === 2) await expect.poll(() => probe!.evaluate(probe => probe.published())).toBe(true);
          await page.waitForTimeout(80);
        }
        const result = await probe.evaluate(probe => probe.stop()) as { frames: number; comparisons: number; jumps: number;
          publicationDuringScroll: boolean; movementAfterPublication: boolean; scrollWrites: number; reverseMovement: number };
        await probe.dispose();
        probe = undefined;
        expect(result.frames).toBeGreaterThan(12);
        expect(result.comparisons).toBeGreaterThan(12);
        expect(result.jumps).toBe(0);
        expect(result.publicationDuringScroll, JSON.stringify(result)).toBe(true);
        expect(result.movementAfterPublication, JSON.stringify(result)).toBe(true);
        expect(result.scrollWrites).toBe(0);
        expect(result.reverseMovement).toBe(0);
        expect(escaped).toEqual([]);
      } finally {
        await probe?.evaluate(probe => probe.stop()).catch(() => {});
        await probe?.dispose();
        await page.unrouteAll({ behavior: "wait" });
      }
    });
  }

  test("buffer publication preserves mounted Justified early demand", async ({ page }) => {
    await page.clock.install();
    for (const retainGeometry of [true, false]) {
      const escaped = await isolatePublicationFixture(page, origin);
      let probe: JSHandle<{ delta: number; snapshot: () => { reads: number[]; published: boolean; publicationHeadroom: number };
        stop: () => Promise<void> }> | undefined;
      try {
        await page.goto(`${origin}/__publication?density=justified`);
        const region = page.getByRole("region", { name: "Image results justified", exact: true });
        await expect(region.locator('[data-cell-id="img-0"]')).toBeVisible();
        await page.waitForFunction(() => !(window as CommandWindow).__kupua_store__.getState().loading);
        await region.hover();
        await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1_000));
        for (let step = 0; step < 3; step++) {
          const before = await region.evaluate(element => element.scrollTop);
          await page.clock.runFor(16);
          await page.mouse.wheel(0, 100);
          await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeGreaterThan(before);
        }
        probe = await page.evaluateHandle(async retainGeometry => {
          const path = "/src/lib/scroll-geometry-ref.ts";
          const { getLayoutGeometry, getItemLayoutRow } = await import(path);
          const store = (window as CommandWindow).__kupua_store__;
          const state = store.getState();
          if (state.results.length !== 200 || state._extendForwardInFlight) throw new Error("Early-demand setup already extended");
          const container = document.querySelector<HTMLElement>('[aria-label="Image results justified"]')!;
          const source = state.dataSource;
          const original = source.searchAfter;
          const ownSearch = Object.getOwnPropertyDescriptor(source, "searchAfter");
          const reads: number[] = [];
          const pending: Promise<unknown>[] = [];
          let release!: () => void;
          const held = new Promise<void>(resolve => { release = resolve; });
          const headroom = () => {
            const geometry = getLayoutGeometry();
            const row = "layout" in geometry && geometry.window?.rowAtOffset(container.scrollTop + container.clientHeight - 0.01);
            if (!row) throw new Error("Mounted Justified viewport unavailable");
            return store.getState().bufferOffset + store.getState().results.length - row.lastItemIndex - 1;
          };
          source.searchAfter = (...args) => {
            reads.push(headroom());
            const work = held.then(() => original.apply(source, args));
            pending.push(work);
            return work;
          };
          let published = false;
          let publicationHeadroom = 0;
          const publish = () => {
            publicationHeadroom = headroom();
            (window as CommandWindow).editorFixture.publish("img-0");
            if (!retainGeometry) store.setState({ results: [...store.getState().results] });
            published = true;
          };
          container.addEventListener("scroll", publish, { capture: true, once: true });
          const destination = getItemLayoutRow(getLayoutGeometry(), 120).top - container.clientHeight;
          return { delta: destination - container.scrollTop, snapshot: () => ({ reads, published, publicationHeadroom }),
            async stop() {
              container.removeEventListener("scroll", publish, true);
              if (ownSearch) Object.defineProperty(source, "searchAfter", ownSearch);
              else delete (source as Partial<typeof source>).searchAfter;
              release();
              await Promise.all(pending);
            } };
        }, retainGeometry);
        const delta = await probe.evaluate(probe => probe.delta);
        expect(delta).toBeGreaterThan(0);
        await page.clock.runFor(16);
        await page.mouse.wheel(0, delta);
        await expect.poll(() => probe!.evaluate(probe => probe.snapshot().published)).toBe(true);
        await page.clock.resume();
        if (retainGeometry) await expect.poll(() => probe!.evaluate(probe => probe.snapshot().reads.length)).toBe(1);
        const result = await probe.evaluate(async probe => {
          for (let frame = 0; frame < 8; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
          return probe.snapshot();
        });
        expect(result.publicationHeadroom).toBeGreaterThan(50);
        if (retainGeometry) {
          expect(result.reads).toHaveLength(1);
          expect(result.reads[0]).toBeGreaterThan(50);
        } else expect(result.reads).toEqual([]);
        expect(escaped).toEqual([]);
      } finally {
        await probe?.evaluate(probe => probe.stop());
        await probe?.dispose();
        await page.unrouteAll({ behavior: "wait" });
      }
    }
  });

  test("buffer publication still rebuilds genuine Justified geometry", async ({ page }) => {
    const escaped = await isolatePublicationFixture(page, origin);
    try {
      await page.goto(`${origin}/__publication?density=justified`);
      const region = page.getByRole("region", { name: "Image results justified", exact: true });
      await expect(region.locator('[data-cell-id="img-0"]')).toBeVisible();
      const result = await page.evaluate(async () => {
        const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        for (let count = 0; count < 8; count++) await frame();
        const fixture = (window as CommandWindow).editorFixture;
        const path = "/src/lib/scroll-geometry-ref.ts";
        const { getLayoutGeometry } = await import(path);
        const cell = document.querySelector('[data-cell-id="img-0"]')!;
        const before = cell.getBoundingClientRect().width;
        const geometry = getLayoutGeometry();
        fixture.publishGeometryChange("img-0");
        for (let count = 0; count < 12; count++) await frame();
        return { before, after: cell.getBoundingClientRect().width, changedGeometry: getLayoutGeometry() !== geometry };
      });
      expect(result.after).not.toBe(result.before);
      expect(result.changedGeometry).toBe(true);
      expect(escaped).toEqual([]);
    } finally {
      await page.unrouteAll({ behavior: "wait" });
    }
  });
});

function labelCommand(origin: string) {
  return { operation: "add-labels", imageId: "fixture", labels: ["fixture label"],
    resource: { links: [{ rel: "edits", href: `${origin}/metadata/fixture` }] } };
}

async function exerciseLabelEditor(page: Page) {
  const aggregationBodies: Record<string, unknown>[] = [];
  const suggestionsRoute = "**/images/aggregations";
  const suggestionsHandler: Parameters<Page["route"]>[1] = async route => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : undefined;
    if (body) aggregationBodies.push(body);
    const text = body?.fields?.[0]?.match?.text as string | undefined;
    const popular = [{ key: "News", count: 9 }, { key: "News agency", count: 4 }];
    const buckets = text ? [...popular, { key: "Football", count: 2 }].filter(bucket => bucket.key.toLowerCase().startsWith(text.toLowerCase())) : popular;
    await route.fulfill({ json: { fields: { "userMetadata.labels": { buckets } }, isFilterCounts: {}, ...(text && { matchedField: "userMetadata.labels" }) }, headers: {
      "Access-Control-Allow-Origin": new URL(page.url()).origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    } });
  };
  await page.route(suggestionsRoute, suggestionsHandler);
  try {
  await page.evaluate(() => (window as CommandWindow).editorFixture.mount());
  const editor = page.getByRole("region", { name: "Label editor fixture", exact: true });
  const input = editor.getByRole("combobox", { name: "Add label", exact: true });
  const plus = editor.getByRole("button", { name: "Add label", exact: true, includeHidden: true });
  await expect(input).toHaveCount(0);
  const plusBounds = await plus.evaluate(element => element.getBoundingClientRect().toJSON());
  await plus.click();
  await expect(input).toHaveAttribute("placeholder", "label1, label2, label3\u2026");
  await expect(plus).toBeHidden();
  expect(await plus.evaluate(element => element.getBoundingClientRect().toJSON())).toEqual(plusBounds);
  await expect(page.getByText("Target images", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/selected:.*eligible/)).toHaveCount(0);
  const pill = editor.getByRole("button", { name: "news", exact: true });
  const applyToAll = editor.getByRole("button", { name: "Apply news to all selected images", exact: true });
  const removeLabel = editor.getByRole("button", { name: "Remove news from all selected images", exact: true });
  const geometry = await pill.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const group = element.closest("[data-editable-pill]") ?? element.parentElement!.parentElement!;
    const buttons = [...group.querySelectorAll("button")].map(button => button.getBoundingClientRect());
    return { height: bounds.height, lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      gaps: buttons.slice(1).map((button, index) => button.left - buttons[index].right) };
  });
  expect(geometry.height).toBeCloseTo(geometry.lineHeight, 0);
  expect(geometry.gaps).toEqual([0, 0]);
  await expect(applyToAll).toHaveAttribute("title", "Apply label to all 2 images");
  await expect(removeLabel).toHaveAttribute("title", "Remove label from 1 image");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(pill).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(applyToAll).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(removeLabel).toHaveCSS("color", "rgb(0, 173, 238)");
  await expect(applyToAll).toHaveCSS("cursor", "pointer");
  await expect(removeLabel).toHaveCSS("cursor", "pointer");
  await applyToAll.hover();
  await expect(applyToAll).toHaveCSS("background-color", "rgb(0, 86, 137)");
  await expect(applyToAll.locator("svg")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(pill).toHaveCSS("color", "rgb(0, 173, 238)");
  await removeLabel.hover();
  await expect(removeLabel.locator("svg")).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.mouse.move(0, 0);
  await page.getByRole("region", { name: "Label editor fixture" }).screenshot({ path: test.info().outputPath("pill-partial.png") });
  await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["fixture"]));
  await expect(applyToAll).toHaveCount(0);
  const removeFullLabel = editor.getByRole("button", { name: "Remove news", exact: true });
  await expect(removeFullLabel).toHaveAttribute("title", "Remove label from 1 image");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(0, 173, 238)");
  expect((await pill.boundingBox())?.height).toBeCloseTo(geometry.height, 0);
  await expect(pill).toHaveCSS("color", "rgb(255, 255, 255)");
  await pill.hover();
  await expect(pill).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(pill).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(removeFullLabel).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(pill.locator("xpath=../..")).toHaveCSS("background-color", "rgb(0, 173, 238)");
  await removeFullLabel.hover();
  await expect(removeFullLabel).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(removeFullLabel.locator("svg")).toHaveCSS("color", "rgb(0, 86, 137)");
  await expect(pill).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.mouse.move(0, 0);
  await page.getByRole("region", { name: "Label editor fixture" }).screenshot({ path: test.info().outputPath("pill-full.png") });
  await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["fixture", "other"]));
  await input.fill("no matching popular label");
  await expect(input).toHaveAttribute("aria-busy", "false");
  const fixture = page.getByRole("region", { name: "Label editor fixture" });
  const closedSuggestionsHeight = (await fixture.boundingBox())!.height;
  await input.fill("first, nE, last");
  for (let offset = 0; offset < 6; offset++) await input.press("ArrowLeft");
  const options = page.getByRole("option");
  await expect(options.locator("span:first-child")).toHaveText(["News", "News agency"]);
  expect((await fixture.boundingBox())!.height).toBe(closedSuggestionsHeight);
  await options.first().click();
  await expect(input).toHaveValue("first, News, last");
  expect((await page.evaluate(() => (window as CommandWindow).editorFixture.snapshot())).receipts).toHaveLength(0);
  await input.fill("first, News, last, fO");
  await expect(options.locator("span:first-child")).toHaveText(["Football"]);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue("first, News, last, Football");
  expect(aggregationBodies.length).toBeGreaterThan(0);
  for (const body of aggregationBodies) {
    const spec = (body.fields as Array<{ match?: { text: string } }>)[0];
    expect(body).toEqual({ q: "", fields: [{ field: "userMetadata.labels", size: 50,
      ...(spec.match && { match: { mode: "prefix", text: expect.any(String) } }) }] });
  }
  expect(aggregationBodies).toContainEqual({ q: "", fields: [{ field: "userMetadata.labels", size: 50, match: { mode: "prefix", text: "fO" } }] });
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(plus).toBeFocused();
  await plus.click();
  await expect(input).toHaveValue("");
  await input.fill("retained label");
  await page.evaluate(() => (window as CommandWindow).editorFixture.show(false));
  await expect(input).toHaveCount(0);
  await page.evaluate(() => (window as CommandWindow).editorFixture.show());
  await plus.click();
  await expect(input).toHaveValue("retained label");
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: "Remove news from all selected images", exact: true }).click();
  expect((await page.evaluate(() => (window as CommandWindow).editorFixture.snapshot())).receipts).toMatchObject([
    { mode: "disconnected", intent: { action: "add", label: "retained label", targetIds: ["fixture", "other"] } },
    { mode: "disconnected", intent: { action: "remove", label: "news", targetIds: ["fixture", "other"] } },
  ]);
  await page.evaluate(() => (window as CommandWindow).editorFixture.mount(true));
  const apply = page.getByRole("button", { name: "Apply news to all selected images", exact: true });
  await apply.dblclick();
  const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.snapshot());
  await expect.poll(async () => (await snapshot()).calls).toBe(2);
  expect((await snapshot()).receipts[0].items.map(item => item.state)).toEqual(["submitted", "unknown"]);
  await page.evaluate(() => {
    (window as CommandWindow).editorFixture.targets(["new-selection"], true);
    (window as CommandWindow).editorFixture.release({ outcome: "acknowledged" });
  });
  await expect.poll(async () => (await snapshot()).receipts[0].items[0].state).toBe("accepted-awaiting-visibility");
  expect((await snapshot()).receipts[0].intent.targetIds).toEqual(["fixture", "other"]);
  await expect(editor.getByRole("button", { name: "Remove news", exact: true })).toBeDisabled();
  } finally {
    await page.unroute(suggestionsRoute, suggestionsHandler);
  }
}

async function exerciseObservedEditor(page: Page) {
  const reads: string[][] = [];
  let observing = false;
  const routePattern = "**/images/mget";
  await page.route(routePattern, async route => {
    const ids = route.request().postDataJSON().ids as string[];
    if (observing) reads.push(ids);
    if (reads.length > 1) {
      await route.fulfill({ status: 503, json: { error: "synthetic-required-read-failure" } });
      return;
    }
    await route.fulfill({ json: { data: ids.map(id => ({
      uri: `https://api.example.test/images/${id}`, links: [], actions: [],
      data: { id, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-11-07T00:00:00Z",
        metadata: { description: `Observed ${id}` }, cost: "free", valid: true, invalidReasons: {},
        usageRights: { category: "staff-photographer" }, source: { dimensions: { width: 800, height: 600 } },
        userMetadata: { data: { lastModified: observing ? "2026-11-07T00:00:00Z" : "2026-11-01T00:00:00Z", labels: { data: [{ data: observing && id === "fixture" ? "Unit D label" : "news" }] },
          metadata: {}, usageRights: {}, archived: { data: false }, photoshoot: {} } },
        usages: { data: [] }, leases: { data: { leases: [] } }, collections: [] },
    })) } });
  });
  try {
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture", "other"]));
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected.map(image => image.labels))).toEqual([["news"], ["news"]]);
    observing = true;
    await page.evaluate(() => (window as CommandWindow).editorFixture.mount(true, true));
    const fixture = page.getByRole("region", { name: "Label editor fixture", exact: true });
    await fixture.getByRole("button", { name: "Add label", exact: true }).click();
    const input = fixture.getByRole("combobox", { name: "Add label", exact: true });
    await input.fill("Unit D label");
    await input.press("Enter");
    const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.snapshot());
    await expect.poll(async () => (await snapshot()).calls).toBe(2);
    await page.evaluate(() => (window as CommandWindow).editorFixture.targets(["new-selection"], true));
    await expect.poll(async () => (await snapshot()).receipts[0]?.items.map(item => item.observation)).toEqual(["observed", "unavailable"]);
    const receipt = (await snapshot()).receipts[0];
    expect(receipt.intent.targetIds).toEqual(["fixture", "other"]);
    expect(receipt.items.map(item => ({ id: item.imageId, state: item.state }))).toEqual([
      { id: "fixture", state: "accepted-awaiting-visibility" }, { id: "other", state: "unknown" },
    ]);
    expect(reads).toEqual([["fixture", "other"], ["other"]]);
    expect((await snapshot()).calls).toBe(2);
    expect((await snapshot()).commands.map(command => ({ operation: command.operation, id: command.imageId, labels: command.operation === "add-labels" ? command.labels : undefined }))).toEqual([
      { operation: "add-labels", id: "fixture", labels: ["Unit D label"] },
      { operation: "add-labels", id: "other", labels: ["Unit D label"] },
    ]);
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected)).toEqual([
      { id: "fixture", labels: ["Unit D label"] }, { id: "other", labels: ["news"] },
    ]);
    await expect(fixture).toBeVisible();
  } finally {
    await page.evaluate(() => (window as CommandWindow).editorFixture.release({ outcome: "unknown" }));
    await page.unroute(routePattern);
  }
}

async function exerciseObservedRemoval(page: Page, outcome: "acknowledged" | "unknown") {
  const reads: string[][] = [];
  let observing = false;
  const routePattern = "**/images/mget";
  await page.route(routePattern, async route => {
    const ids = route.request().postDataJSON().ids as string[];
    if (observing) reads.push(ids);
    await route.fulfill({ json: { data: ids.map(id => ({
      uri: `https://api.example.test/images/${id}`, links: [], actions: [],
      data: { id, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-11-07T00:00:00Z",
        metadata: { description: `Removal ${id}` }, cost: "free", valid: true, invalidReasons: {},
        usageRights: { category: "staff-photographer" }, source: { dimensions: { width: 800, height: 600 } },
        userMetadata: { data: { lastModified: observing ? "2026-11-07T00:00:00Z" : "2026-11-01T00:00:00Z",
          labels: { data: (reads.length >= 2 ? ["news suffix"] : ["news"]).map(data => ({ data })) },
          metadata: {}, usageRights: {}, archived: { data: false }, photoshoot: {} } },
        usages: { data: [] }, leases: { data: { leases: [] } }, collections: [] },
    })) } });
  });
  try {
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture"]));
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected.map(image => image.labels))).toEqual([["news"]]);
    await page.evaluate(() => {
      const fixture = (window as CommandWindow).editorFixture;
      fixture.mount(true, true, true);
      fixture.targets(["fixture"]);
    });
    observing = true;
    const fixture = page.getByRole("region", { name: "Label editor fixture", exact: true });
    await fixture.getByRole("button", { name: "Remove news", exact: true }).dblclick();
    const snapshot = () => page.evaluate(() => (window as CommandWindow).editorFixture.snapshot());
    const submitted = await snapshot();
    expect(submitted.calls).toBe(1);
    expect(submitted.receipts[0].items[0].state).toBe("submitted");
    expect(reads).toEqual([]);
    await page.evaluate(outcome => {
      const fixture = (window as CommandWindow).editorFixture;
      fixture.targets(["new-selection"], true);
      fixture.release({ outcome });
    }, outcome);
    await page.waitForFunction(() => (window as CommandWindow).editorFixture.snapshot().receipts[0].items[0].observation === "observed",
      undefined, { timeout: 5000 });
    const observed = await snapshot();
    expect(observed.commands).toEqual([{ operation: "remove-label", imageId: "fixture", label: "news",
      resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/fixture" }] } }]);
    expect(observed.receipts[0]).toMatchObject({ intent: { action: "remove", label: "news", targetIds: ["fixture"] },
      items: [{ imageId: "fixture", state: outcome === "unknown" ? "unknown" : "accepted-awaiting-visibility", observation: "observed" }] });
    expect(reads).toEqual([["fixture"], ["fixture"]]);
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected)).toEqual([{ id: "fixture", labels: ["news suffix"] }]);
    expect(observed.calls).toBe(1);
  } finally {
    await page.evaluate(() => (window as CommandWindow).editorFixture.release({ outcome: "unknown" }));
    await page.unroute(routePattern);
  }
}

function appLabelReceipts(page: Page, label: string, action = "add") {
  return page.evaluate(({ label, action }) => (window as CommandWindow).editorFixture.appReceipts()
    .filter(receipt => receipt.intent.action === action && receipt.intent.label === label), { label, action });
}

async function exerciseConnectedEditor(page: Page, beforeDispatch: () => void, checkRetainedLabel = false) {
  await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture"]));
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().metadataCache.has("fixture"))).toBe(true);
  const original = await page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected[0].labels);
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().loading)).toBe(false);
  await page.evaluate(() => {
    const fixture = (window as CommandWindow).editorFixture;
    fixture.focus("fixture");
    fixture.select(["fixture"]);
  });
  const cell = page.getByRole("region", { name: "Image results grid", exact: true }).locator('[data-cell-id="fixture"]');
  await expect(cell).toBeVisible();
  const originalBox = await cell.boundingBox();
  await page.getByRole("button", { name: "Add label", exact: true }).click();
  const input = page.getByRole("combobox", { name: "Add label", exact: true });
  await input.fill("connected fixture label");
  beforeDispatch();
  if (checkRetainedLabel) {
    const keyword = page.locator("[data-editable-pill]").filter({ has: page.getByRole("button", { name: "untouched keyword", exact: true }) });
    await expect(keyword).toHaveAttribute("data-coverage", "all");
    const background = await keyword.evaluate(element => getComputedStyle(element).backgroundColor);
    const pattern = "**/images/mget";
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(pattern, async route => { await held; await route.continue(); }, { times: 1 });
    try {
      await Promise.all([page.waitForRequest(pattern), input.press("Enter")]);
      await expect.poll(() => appLabelReceipts(page, "connected fixture label")).toMatchObject([{
        intent: { targetIds: ["fixture"] }, items: [{ state: "accepted-awaiting-visibility", observation: "pending" }],
      }]);
      const pill = page.locator("[data-editable-pill]").filter({ has: page.getByRole("button", { name: original![0], exact: true }) });
      await expect(pill).toBeVisible();
      await expect(page.getByRole("button", { name: `Remove ${original![0]}`, exact: true })).toBeDisabled();
      await expect(pill).toHaveAttribute("data-coverage", "all");
      await expect(pill).toHaveCSS("background-color", "rgb(0, 173, 238)");
      await expect(keyword).toHaveCSS("background-color", background);
      await expect(keyword).toHaveAttribute("data-coverage", "all");
      await expect(page.getByRole("button", { name: `Apply ${original![0]} to all selected images` })).toHaveCount(0);
    } finally { release(); }
  } else await input.press("Enter");
  await expect.poll(() => appLabelReceipts(page, "connected fixture label")).toMatchObject([{ items: [{ observation: "observed" }] }]);
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected[0].labels)).toEqual([...original!, "connected fixture label"]);
  const remove = page.getByRole("button", { name: "Remove connected fixture label", exact: true });
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect.poll(() => appLabelReceipts(page, "connected fixture label", "remove")).toMatchObject([{ items: [{ observation: "observed" }] }]);
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected[0].labels)).toEqual(original);
  await expect(remove).toHaveCount(0);
  expect(await cell.boundingBox()).toEqual(originalBox);
}

async function exerciseBulkEditor(page: Page, setReadbackHold: (hold: (() => Promise<void>) | undefined) => void) {
  const ids = ["fixture", "other"];
  await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
  await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected
    .map(image => image.labels !== undefined))).toEqual([true, true]);
  await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeEnabled();
  const cell = page.getByRole("region", { name: "Image results grid", exact: true }).locator('[data-cell-id="fixture"]');
  const box = await cell.boundingBox();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let observedRequest = false;
  setReadbackHold(async () => {
    setReadbackHold(undefined);
    observedRequest = true;
    await held;
  });
  const add = async (label: string) => {
    await page.getByRole("button", { name: "Add label", exact: true }).click();
    const input = page.getByRole("combobox", { name: "Add label", exact: true });
    await input.fill(label);
    await input.press("Enter");
  };
  const receipt = async (label: string, action = "add") => (await appLabelReceipts(page, label, action)).at(-1);
  try {
    await add("batch fixture label");
    await expect.poll(() => observedRequest).toBe(true);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["queued"]));
    await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeEnabled();
    await add("queued fixture label");
    await expect.poll(() => receipt("queued fixture label")).toMatchObject({ items: [{ state: "queued" }] });
    await expect(page.getByRole("button", { name: "Stop remaining" })).toHaveCount(0);
    await page.evaluate(() => {
      const fixture = (window as CommandWindow).editorFixture;
      fixture.stopQueued(fixture.appReceipts().findIndex(entry => entry.intent.label === "queued fixture label"));
    });
    await expect.poll(() => receipt("queued fixture label")).toMatchObject({ items: [{ state: "stopped" }] });
    await add("queued fixture label");
    await expect.poll(() => receipt("queued fixture label")).toMatchObject({ items: [{ state: "queued" }] });
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate("fixture"));
    await expect(page.locator("[data-detail-image-id]")).toHaveAttribute("data-detail-image-id", "fixture");
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture
      .publicationSnapshot("fixture").residentLabels)).toContain("batch fixture label");
    expect((await receipt("batch fixture label"))?.items.some(item => item.observation === "pending")).toBe(true);
    release();
    await expect.poll(() => receipt("batch fixture label")).toMatchObject({ intent: { targetIds: ids }, items: [{ observation: "observed" }, { observation: "observed" }] });
    await expect.poll(() => receipt("queued fixture label")).toMatchObject({ items: [{ observation: "observed" }] });
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate());
    await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected
      .map(image => image.labels?.includes("batch fixture label")))).toEqual([true, true]);
    await page.getByRole("button", { name: "Remove batch fixture label from all selected images", exact: true }).click();
    await expect.poll(() => receipt("batch fixture label", "remove")).toMatchObject({ items: [{ observation: "observed" }, { observation: "observed" }] });
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.publicationSnapshot("fixture").selectedIds)).toEqual(ids);
    expect(await cell.boundingBox()).toEqual(box);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["other"]));
    await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeEnabled();
    await add("partial fixture label");
    await expect.poll(() => receipt("partial fixture label")).toMatchObject({ items: [{ observation: "observed" }] });
    await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected
      .map(image => image.labels?.includes("partial fixture label")))).toEqual([false, true]);
    await page.getByRole("button", { name: "Remove partial fixture label from all selected images", exact: true }).click();
    await expect.poll(() => receipt("partial fixture label", "remove")).toMatchObject({ items: [
      { observation: "observed", result: { outcome: "unchanged" } }, { observation: "observed", result: { outcome: "acknowledged" } },
    ] });
    await expect.poll(() => page.evaluate(() => (window as CommandWindow).editorFixture.readbackSnapshot().selected
      .map(image => image.labels?.includes("partial fixture label")))).toEqual([false, false]);
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.publicationSnapshot("fixture").selectedIds)).toEqual(ids);
    expect(await cell.boundingBox()).toEqual(box);
  } finally { release(); setReadbackHold(undefined); }
}

async function exerciseRecoveryEditor(page: Page, holdProjection: (hold: boolean) => void) {
  const ids = ["fixture", "other"];
  const label = "recovery fixture label";
  await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
  const add = async () => {
    await page.getByRole("button", { name: "Add label", exact: true }).click();
    const input = page.getByRole("combobox", { name: "Add label", exact: true });
    await input.fill(label);
    await input.press("Enter");
  };
  holdProjection(true);
  try {
    await add();
    await expect.poll(async () => (await appLabelReceipts(page, label)).at(-1)?.items.map(item => item.observation),
      { timeout: 12_000 }).toEqual(["deadline", "observed"]);
    await expect(page.getByRole("button", { name: "Add label", exact: true })).toBeDisabled();
    holdProjection(false);
    await page.getByRole("button", { name: "Deselect", exact: true }).click();
    const cell = page.getByRole("region", { name: "Image results grid", exact: true }).locator('[data-cell-id="fixture"]');
    const issue = page.getByRole("button", { name: "1 issue", exact: true });
    await issue.click();
    await expect(page.locator(":popover-open")).toContainText("Labels: 1 not confirmed");
    await expect(page.getByRole("status", { name: "0 selected" })).toBeVisible();
    await page.keyboard.press("Escape");
    const viewport = page.viewportSize()!;
    const touch = await page.context().newCDPSession(page);
    try {
      await page.setViewportSize({ width: 320, height: 700 });
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await expect(page.locator("html")).toHaveAttribute("data-shell", "compact");
      await issue.click();
      const pop = page.locator(":popover-open");
      await expect(pop).toBeVisible();
      const bounds = (await pop.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      await pop.getByRole("button", { name: "Select only this image" }).click();
      await expect(issue).toHaveCount(0);
      expect(await page.evaluate(() => (window as CommandWindow).editorFixture.publicationSnapshot("fixture").selectedIds)).toEqual(["fixture"]);
      await expect(cell).toBeInViewport();
    } finally {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await touch.detach();
      await page.setViewportSize(viewport);
    }
    await expect(page.getByRole("button", { name: "Remove recovery fixture label", exact: true })).toBeEnabled();
    await page.evaluate(ids => (window as CommandWindow).editorFixture.select(ids), ids);
    await add();
    await expect.poll(() => appLabelReceipts(page, label)).toMatchObject([
      { items: [{ observation: "deadline" }, { observation: "observed" }] },
      { items: [{ observation: "observed" }, { observation: "observed" }] },
    ]);
  } finally { holdProjection(false); }
}

async function discardOnNavigation(page: Page, navigate: () => Promise<unknown>) {
  const accept = (dialog: Dialog) => dialog.accept();
  page.on("dialog", accept);
  try { await navigate(); }
  finally { page.off("dialog", accept); }
}

async function applyEditingFromPanel(page: Page, allowed: boolean, shortcut = false, screenshot?: string) {
  if (shortcut) await page.keyboard.press("Shift+F12");
  else {
    await page.getByRole("button", { name: "Settings", exact: true }).filter({ visible: true }).first().click();
    await page.getByRole("menuitem", { name: "Hello, Joshua", exact: true }).click();
  }
  const panel = page.getByRole("dialog", { name: "Hello, Joshua", exact: true });
  await expect(panel).toBeVisible();
  await panel.getByRole("checkbox", { name: "Allow editing", exact: true }).setChecked(allowed);
  const apply = panel.getByRole("button", { name: "Apply and reload", exact: true });
  await apply.focus();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Close Hi, Joshua", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(apply).toBeFocused();
  if (screenshot) await page.screenshot({ path: screenshot });
  await discardOnNavigation(page, () => Promise.all([
    page.waitForEvent("load"), panel.getByRole("button", { name: "Apply and reload", exact: true }).click(),
  ]));
  await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
}

for (const fixedRoutes of [false, true]) {
test(`local commands use ${fixedRoutes ? "direct TEST metadata and proxied local auth" : "explicit guarded proxy targets"} and the saved startup preference`, async ({ page }, testInfo) => {
  const received: Array<{ method: string; path: string; body: string }> = [];
  let origin = "";
  let metadataOrigin = "";
  let authOrigin = "";
  const labelsById = new Map(["fixture", "other", "queued"].map(imageId => [imageId, ["fixture label"]]));
  const archivedIds = new Set(["other"]);
  const crowdedLabels = Array.from({ length: 24 }, (_, index) => `${"LongEditorialLabel".repeat(5)} ${index}`);
  let version = 0;
  const imageEntity = (imageId: string) => ({
    uri: `${origin}/images/${imageId}`, links: [{ rel: "edits", href: `${metadataOrigin}/metadata/${imageId}` }, { rel: "download", href: `${origin}/images/${imageId}/download` }], actions: [],
    data: { id: imageId, uploadTime: "2026-01-01T00:00:00Z", metadata: { keywords: ["untouched keyword"] }, persisted: { value: archivedIds.has(imageId), reasons: archivedIds.has(imageId) ? ["archived"] : [] },
      collections: ["Front desk", "Back desk"].map(parent => ({ data: { path: [parent, "Finals"], pathId: `${parent.toLowerCase()}/finals` } })),
      source: { dimensions: { width: 800, height: 600 } },
      userMetadata: { data: { lastModified: new Date(Date.UTC(2026, 10, 7) + version * 1000).toISOString(),
        labels: { data: labelsById.get(imageId)!.map(data => ({ data })) }, archived: { uri: `${metadataOrigin}/metadata/${imageId}/archived`, data: archivedIds.has(imageId) },
        metadata: {}, usageRights: {}, photoshoot: {} } } },
  });
  const upstream = createHttpServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ method: request.method ?? "", path: request.url ?? "", body });
    const imageId = request.url?.match(/^\/(?:metadata|images)\/(fixture|other|queued)(?:\/|$)/)?.[1];
    const labels = labelsById.get(imageId ?? "") ?? [];
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/") response.end(JSON.stringify({ links: [{ rel: "edits", href: metadataOrigin }, { rel: "archive", href: `${metadataOrigin}/metadata/{id}/archived` }, { rel: "session", href: `${authOrigin}/session` }] }));
    else if (request.url === "/session") response.end(JSON.stringify({ data: { user: { permissions: {} } } }));
    else if (request.url === "/images/search-after") response.end(JSON.stringify({ data: [imageEntity("fixture")], total: 1,
      sortValues: [[Date.UTC(2026, 0, 1), "fixture"]] }));
    else if (request.url === "/images/count") response.end(JSON.stringify({ total: JSON.parse(body).since ? 0 : 1 }));
    else if (request.url === "/images/mget") response.end(JSON.stringify({ data: (JSON.parse(body).ids as string[])
      .filter(imageId => labelsById.has(imageId)).map(imageId => imageEntity(imageId)) }));
    else if (imageId && request.url === `/images/${imageId}`) response.end(JSON.stringify(imageEntity(imageId)));
    else if (imageId && request.url === `/metadata/${imageId}` && request.method === "GET") {
      response.end(JSON.stringify({ data: { labels: { uri: `${metadataOrigin}/metadata/${imageId}/labels`,
        data: labels.map(label => ({ uri: `${metadataOrigin}/metadata/${imageId}/labels/${new URLSearchParams({ label }).toString().slice(6)}`, data: label })) } } }));
    } else if (imageId && request.url === `/metadata/${imageId}/archived` && request.method === "PUT") {
      if (JSON.parse(body).data === true) archivedIds.add(imageId); else archivedIds.delete(imageId);
      version++; response.end("{}");
    } else if (imageId && request.url === `/metadata/${imageId}/labels` && request.method === "POST") {
      labelsById.set(imageId, [...new Set([...labels, ...(JSON.parse(body).data as string[])])]);
      version++;
      response.end("{}");
    } else if (imageId && request.url?.startsWith(`/metadata/${imageId}/labels/`) && request.method === "DELETE") {
      const label = decodeURIComponent(request.url.slice(`/metadata/${imageId}/labels/`.length).replace(/\+/g, " "));
      labelsById.set(imageId, labels.filter(value => value !== label));
      version++;
      response.end("{}");
    }
    else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("No fixture address");
  origin = `http://127.0.0.1:${address.port}`;
  metadataOrigin = fixedRoutes ? "https://media-metadata.test.dev-gutools.co.uk" : origin;
  authOrigin = fixedRoutes ? "https://media-auth.local.dev-gutools.co.uk" : origin;
  const metadataPrefix = fixedRoutes ? "/grid-test-metadata" : "/grid-metadata";
  const authPrefix = fixedRoutes ? "/grid-local-auth" : "/grid-auth";
  const proxyPaths: string[] = [];
  const directCredentials: boolean[] = [];
  const recordProxyRequest = (request: import("@playwright/test").Request) => {
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.startsWith("/grid-")) proxyPaths.push(path);
    else if (fixedRoutes && url.origin === metadataOrigin && request.method() !== "OPTIONS") proxyPaths.push(`direct-test${path}`);
  };
  const env = {
    VITEST: "true", VITE_USE_MEDIA_API: "true", VITE_HOSTED: "false", VITE_MEDIA_API_BASE_URL: "/api",
    VITE_GRID_METADATA_ORIGIN: fixedRoutes ? "" : origin, VITE_GRID_AUTH_ORIGIN: fixedRoutes ? "" : origin,
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    vite = await createServer({
      configFile: resolve("vite.config.ts"), cacheDir: testInfo.outputPath("vite-cache"), plugins: [fixturePlugin],
      server: { host: "127.0.0.1", port: 0, proxy: { "/api": { target: origin, secure: true },
        ...Object.fromEntries(gridServiceProxyRoutes().map(route => [`^${route.prefix}/`, { target: origin }])) } },
    });
    await vite.listen();
    const localOrigin = vite.resolvedUrls!.local[0].replace(/\/$/, "");
    if (fixedRoutes) await page.context().addCookies([{ name: "fixture-test-session", value: "synthetic",
      domain: "media-metadata.test.dev-gutools.co.uk", path: "/", secure: true, sameSite: "None" }]);
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === localOrigin) { await route.continue(); return; }
      if (!fixedRoutes || url.origin !== metadataOrigin) { await route.abort(); return; }
      const headers = { "Access-Control-Allow-Origin": localOrigin, "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
      if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
      directCredentials.push((await request.allHeaders()).cookie?.includes("fixture-test-session=synthetic") === true);
      const response = await fetch(`${origin}${url.pathname}`, { method: request.method(),
        headers: { "Content-Type": "application/json" }, body: request.postData() ?? undefined,
        redirect: "error", signal: AbortSignal.timeout(10_000) });
      await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json", headers });
    });
    await page.goto(`${localOrigin}/__commands`);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    if (!fixedRoutes) {
      await exerciseLabelEditor(page);
      await exerciseObservedEditor(page);
      await discardOnNavigation(page, () => page.reload());
      await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
      await exerciseObservedRemoval(page, "acknowledged");
    }
    expect(received).toEqual([]);
    expect((await page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(metadataOrigin))).outcome).toBe("blocked");
    await page.evaluate(() => localStorage.setItem("kupua-allow-editing", "true"));
    await discardOnNavigation(page, () => page.reload());
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    page.on("request", recordProxyRequest);
    const result = await page.evaluate((command) => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(metadataOrigin));
    expect(result.outcome).toBe("acknowledged");
    const metadataTransport = fixedRoutes ? "direct-test" : metadataPrefix;
    expect(proxyPaths).toEqual([`${authPrefix}/session`, `${metadataTransport}/metadata/fixture`, `${metadataTransport}/metadata/fixture/labels`]);
    if (fixedRoutes) expect(directCredentials).toEqual([true, true]);
    expect(received).toEqual([
      { method: "GET", path: "/", body: "" }, { method: "GET", path: "/session", body: "" },
      { method: "GET", path: "/metadata/fixture", body: "" },
      { method: "POST", path: "/metadata/fixture/labels", body: JSON.stringify({ data: ["fixture label"] }) },
    ]);
    const refused = await page.evaluate(async ({ metadataPrefix, authPrefix }) => Promise.all([
      [`${metadataPrefix}/metadata/fixture/labels`, "DELETE"],
      [`${metadataPrefix}/metadata/fixture/labels/extra`, "POST"],
      [`${authPrefix}/session`, "POST"], ["/api/images/fixture", "DELETE"],
      [`${metadataPrefix}-unexpected/metadata/fixture/labels`, "POST"],
    ].map(async ([path, method]) => (await fetch(path, { method })).status)), { metadataPrefix, authPrefix });
    expect(refused).toEqual([403, 403, 403, 403, 404]);
    const removal = { operation: "remove-label", imageId: "fixture", label: "fixture label", resource: labelCommand(metadataOrigin).resource };
    expect((await page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), removal)).outcome).toBe("acknowledged");
    expect(received.slice(4)).toEqual([{ method: "GET", path: "/metadata/fixture", body: "" },
      { method: "DELETE", path: "/metadata/fixture/labels/fixture+label", body: "" }]);
    expect(received).toHaveLength(6);
    if (!fixedRoutes) labelsById.get("fixture")!.push("existing desk label");
    await discardOnNavigation(page, () => page.goto(`${localOrigin}/__connected`));
    await page.waitForFunction(() => Boolean((window as CommandWindow).editorFixture));
    let beforeConnected = received.length;
    await exerciseConnectedEditor(page, () => { beforeConnected = received.length; }, !fixedRoutes);
    expect(received.slice(beforeConnected).filter(request => request.path.startsWith("/metadata/") && request.method !== "GET")).toEqual([
      { method: "POST", path: "/metadata/fixture/labels", body: JSON.stringify({ data: ["connected fixture label"] }) },
      { method: "DELETE", path: "/metadata/fixture/labels/connected+fixture+label", body: "" },
    ]);
    expect(received.slice(beforeConnected).filter(request => request.path === "/images/mget")).toHaveLength(2);
    if (!fixedRoutes) {
      await page.setViewportSize({ width: 1920, height: 900 });
      await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture", "other"]));
      const cell = page.getByRole("region", { name: "Image results grid" }).locator('[data-cell-id="fixture"]');
      const before = await cell.boundingBox();
      const add = page.getByRole("button", { name: "Add to Library", exact: true });
      await expect(add).toBeEnabled();
      await expect(add.locator(".image-action-full")).toBeVisible();
      const toolbar = page.locator('.image-actions[data-surface="search"]');
      await expect(toolbar.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
      const otherActions = () => toolbar.locator("button").evaluateAll(buttons => buttons.filter(button => !button.querySelector("[data-library-icon]")).map(button => [button.getAttribute("aria-label"), getComputedStyle(button).opacity]));
      const originalActions = await otherActions();
      const buttonWidth = (await add.boundingBox())!.width;
      const archivePath = "**/metadata/fixture/archived";
      let release!: () => void;
      const held = new Promise<void>(done => { release = done; });
      await page.route(archivePath, async route => { await held; await route.continue(); }, { times: 1 });
      try {
        await Promise.all([page.waitForRequest(archivePath), add.click()]);
        await expect(add).toBeDisabled();
        await expect(add.locator('[data-library-icon="add"]')).toBeVisible();
        expect(await otherActions()).toEqual(originalActions);
        expect((await add.boundingBox())!.width).toBe(buttonWidth);
      } finally { release(); }
      const remove = page.getByRole("button", { name: "Remove from Library", exact: true });
      await expect(remove).toBeEnabled();
      expect(await otherActions()).toEqual(originalActions);
      expect((await remove.boundingBox())!.width).toBeGreaterThan(buttonWidth);
      expect(received.filter(request => request.method === "PUT")).toEqual([{ method: "PUT", path: "/metadata/fixture/archived", body: JSON.stringify({ data: true }) }]);
      expect(await cell.boundingBox()).toEqual(before);
      expect(await page.evaluate(() => [...(window as CommandWindow).__kupua_selection_store__.getState().selectedIds].sort())).toEqual(["fixture", "other"]);
      const originalLabels = new Map([...labelsById].map(([id, values]) => [id, [...values]]));
      const beforeLabels = received.length;
      await page.getByRole("button", { name: "Add label", exact: true }).click();
      const labelEntry = page.getByRole("combobox", { name: "Add label", exact: true });
      await labelEntry.fill(" Sport, Football, Sport ");
      await labelEntry.press("Enter");
      for (const value of ["Sport", "Football"]) {
        const removeLabel = page.getByRole("button", { name: `Remove ${value} from all selected images`, exact: true });
        const pill = page.locator("[data-editable-pill]").filter({ has: removeLabel });
        await expect(removeLabel).toBeEnabled();
        await expect(pill).not.toHaveAttribute("aria-busy", "true");
        await expect(pill).toHaveAttribute("data-coverage", "all");
      }
      expect(received.slice(beforeLabels).filter(request => request.method === "POST" && request.path.endsWith("/labels")).sort((left, right) => left.path.localeCompare(right.path)))
        .toEqual(["fixture", "other"].map(id => ({ method: "POST", path: `/metadata/${id}/labels`, body: JSON.stringify({ data: ["Sport", "Football"] }) })));
      for (const id of ["fixture", "other"]) expect(labelsById.get(id)).toEqual([...originalLabels.get(id)!, "Sport", "Football"]);
      await page.evaluate(() => (window as CommandWindow).editorFixture.select([]));
      await page.getByRole("button", { name: "Table view", exact: true }).click();
      const row = page.locator('[role=row][data-cell-id="fixture"]');
      const rowRemove = row.getByRole("button", { name: "Remove from Library" });
      const rowAdd = row.getByRole("button", { name: "Add to Library" });
      await row.hover();
      const addResultLabels = async (target: Locator, text: string) => {
        await target.getByRole("button", { name: "Add labels to this image" }).click();
        const entry = page.getByRole("dialog", { name: "Add labels to image" });
        await entry.getByLabel("New labels", { exact: true }).fill(text);
        await entry.getByRole("button", { name: "Save labels", exact: true }).click();
        await expect(entry).toHaveCount(0);
        await expect.poll(() => labelsById.get("fixture")).toEqual(expect.arrayContaining(text.split(", ")));
      };
      labelsById.get("fixture")!.unshift(...crowdedLabels);
      version++;
      await addResultLabels(row, "Table headline, Table desk");
      const tableRoot = page.locator("[data-table-root]");
      await rowRemove.click({ button: "middle" });
      expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
      await rowRemove.evaluate(button => {
        button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 9 }));
        button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", pointerId: 9 }));
        button.dispatchEvent(new PointerEvent("click", { bubbles: true, pointerType: "touch", pointerId: 9, detail: 1 }));
      });
      await tableRoot.evaluate(el => (el as HTMLElement).style.setProperty("--col-badges", "30px"));
      await expect(rowRemove).toBeHidden();
      await tableRoot.evaluate(el => (el as HTMLElement).style.removeProperty("--col-badges"));
      let releaseRemove!: () => void;
      const removing = new Promise<void>(done => { releaseRemove = done; });
      await page.route(archivePath, async route => { await removing; await route.continue(); }, { times: 1 });
      try {
        await Promise.all([page.waitForRequest(archivePath), rowRemove.click()]);
        await expect(rowRemove).toBeDisabled();
        await expect(rowRemove).toHaveAttribute("aria-busy", "true");
      } finally { releaseRemove(); }
      await expect(rowAdd).toBeVisible();
      await page.evaluate(() => (window as CommandWindow).editorFixture.select(["other"]));
      await expect(rowAdd).toBeHidden();
      await page.evaluate(() => (window as CommandWindow).editorFixture.select([]));
      await rowAdd.focus();
      await rowAdd.press("Enter");
      await expect(rowRemove).toBeVisible();
      await page.getByRole("button", { name: "Grid view", exact: true }).click();
      await cell.hover();
      const strip = cell.locator("[data-grid-strip]");
      expect(await strip.locator("[data-result-pill]").count()).toBeLessThanOrEqual(8);
      const previewPlus = strip.getByRole("button", { name: "Add labels to this image" });
      const fits = await strip.evaluate(el => {
        const bounds = el.getBoundingClientRect(), plus = el.querySelector("[data-result-label-add]")!.getBoundingClientRect();
        return plus.width >= 16 && plus.right <= bounds.right && [...el.querySelectorAll("[data-result-pill]")].every(pill => pill.getBoundingClientRect().right <= plus.left);
      });
      expect(fits).toBe(true);
      await expect(strip.getByTitle("Front desk ▸ Finals")).toHaveAttribute("data-cql-value", "front desk/finals");
      await previewPlus.click();
      await page.getByLabel("New labels", { exact: true }).fill("Grid headline, Grid desk");
      expect(await previewPlus.evaluate(async anchor => {
        const region = anchor.closest('[role="region"]')!;
        const rect = anchor.getBoundingClientRect;
        let reads = 0;
        anchor.getBoundingClientRect = () => { reads++; return rect.call(anchor); };
        try {
          for (let count = 0; count < 8; count++) region.dispatchEvent(new Event("scroll"));
          const synchronous = reads;
          await new Promise(requestAnimationFrame);
          return [synchronous, reads];
        } finally { Reflect.deleteProperty(anchor, "getBoundingClientRect"); }
      })).toEqual([0, 1]);
      const suggestionRoute = "**/images/aggregations";
      const suggestions: Parameters<Page["route"]>[1] = route => route.fulfill({ json: { matchedField: "userMetadata.labels", fields: { "userMetadata.labels": {
        buckets: Array.from({ length: 18 }, (_, index) => ({ key: `Grid desk ${index}`, count: 1 })),
      } }, isFilterCounts: {} } });
      await page.route(suggestionRoute, suggestions);
      const region = page.getByRole("region", { name: "Image results grid" });
      try {
        await region.evaluate(el => { el.style.paddingTop = `${innerHeight / 2}px`; el.style.paddingBottom = `${innerHeight}px`; el.dispatchEvent(new Event("scroll")); });
        await page.getByLabel("New labels", { exact: true }).fill("Grid de");
        const list = page.getByRole("listbox", { name: "Suggestions for New labels" });
        await expect(list).toBeVisible();
        const side = () => list.evaluate(el => el.getBoundingClientRect().bottom <= el.closest("form")!.querySelector("input")!.getBoundingClientRect().top ? "above" : "below");
        await expect.poll(side).toBe("above");
        await region.evaluate(el => { el.scrollTop = innerHeight / 2; });
        await expect.poll(side).toBe("below");
        await expect(page.getByLabel("New labels", { exact: true })).toBeFocused();
      } finally {
        await region.evaluate(el => { el.scrollTop = 0; el.style.removeProperty("padding-top"); el.style.removeProperty("padding-bottom"); });
        await page.unroute(suggestionRoute, suggestions);
      }
      await page.getByLabel("New labels", { exact: true }).fill("Grid headline, Grid desk");
      await page.getByRole("button", { name: "Table view", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Add labels to image" })).toHaveCount(0);
      await page.getByRole("button", { name: "Grid view", exact: true }).click();
      await cell.hover(); await previewPlus.click();
      await expect(page.getByLabel("New labels", { exact: true })).toHaveValue("Grid headline, Grid desk");
      await page.getByRole("button", { name: "Cancel label entry" }).click();
      await addResultLabels(cell, "Grid headline, Grid desk");
      await cell.getByRole("button", { name: "Remove from Library" }).dblclick();
      await expect(cell.getByRole("button", { name: "Add to Library" })).toBeVisible();
      expect(received.filter(request => request.method === "PUT").map(request => [request.path, JSON.parse(request.body).data])).toEqual([true, false, true, false].map(value => ["/metadata/fixture/archived", value]));
      expect(await page.evaluate(() => (window as CommandWindow).__kupua_selection_store__.getState().selectedIds.size)).toBe(0);
      let rejectArchive!: () => void;
      const pendingRejection = new Promise<void>(done => { rejectArchive = done; });
      await page.route(archivePath, async route => { await pendingRejection; await route.fulfill({ status: 403, json: {} }); }, { times: 1 });
      try {
        await Promise.all([page.waitForRequest(archivePath), cell.getByRole("button", { name: "Add to Library" }).click()]);
        await page.getByRole("button", { name: "Table view", exact: true }).click();
        await expect(cell).toHaveCount(0);
      } finally { rejectArchive(); }
      await page.getByRole("button", { name: "1 issue", exact: true }).click();
      await expect(page.locator(":popover-open")).toContainText("Library: 1 not saved");
      await page.keyboard.press("Escape");
      const firstLabel = row.locator('[data-cql-key="label"]').first();
      await firstLabel.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe(`label:"${crowdedLabels[0]}"`);
      await page.getByRole("button", { name: "Grid view", exact: true }).click();
      const collection = cell.locator('[data-cql-value="front desk/finals"]');
      await collection.click({ modifiers: ["Shift"] });
      await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe(`label:"${crowdedLabels[0]}" collection:"front desk/finals"`);
      await collection.click({ modifiers: ["Alt"] });
      await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe(`label:"${crowdedLabels[0]}" -collection:"front desk/finals"`);
    }
    await applyEditingFromPanel(page, false, true, testInfo.outputPath("hi-joshua-desktop.png"));
    expect((await page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(metadataOrigin))).outcome).toBe("blocked");
    const writesBeforeReload = received.filter(request => ["POST", "DELETE"].includes(request.method) && request.path.startsWith("/metadata/")).length;
    await applyEditingFromPanel(page, true);
    expect(await page.evaluate(() => (window as CommandWindow).commandFixture.gridLabelEditingEnabled())).toBe(true);
    expect(received.filter(request => ["POST", "DELETE"].includes(request.method) && request.path.startsWith("/metadata/"))).toHaveLength(writesBeforeReload);
    if (fixedRoutes) expect(directCredentials.every(Boolean)).toBe(true);
  } finally {
    page.off("request", recordProxyRequest);
    await page.unrouteAll({ behavior: "wait" });
    await vite?.close();
    await new Promise<void>((done, reject) => upstream.close((error) => error ? reject(error) : done()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
}

test("built hosted commands fail closed, use direct service origins and stop after expiry", async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const outDir = testInfo.outputPath("hosted");
  await build({
    configFile: resolve("vite.config.ts"), mode: "hosted", plugins: [fixturePlugin],
    build: { outDir, emptyOutDir: true, rollupOptions: {
      input: { index: resolve("index.html"), commands: virtualEntry },
      output: { entryFileNames: "assets/[name].js" },
    } },
  });
  const appOrigin = "https://app.example.test";
  const metadataOrigin = "https://metadata.example.test";
  const authOrigin = "https://auth.example.test";
  const config = { mediaApiUri: "https://api.example.test", gridConfig: { imageTypes: ["Photograph", "Illustration"] } };
  const requests: Array<{ method: string; origin: string; path: string; cookie: string }> = [];
  let writeStatus = 200;
  let connected = false;
  let connectedLabels = ["news"];
  const otherLabels = new Map<string, string[]>();
  let connectedVersion = 0;
  const shoots = new Map<string, { title: string }>();
  const archived = new Set<string>();
  let releaseMetadata: (() => void) | undefined;
  let heldMetadata: Promise<void> | undefined;
  const imageEntity = (imageId: string) => ({
    uri: `${config.mediaApiUri}/images/${imageId}`,
    links: [{ rel: "edits", href: `${metadataOrigin}/metadata/${imageId}` }],
    data: { id: imageId, uploadTime: "2026-01-01T00:00:00Z", lastModified: "2026-01-01T00:00:00Z", uploadedBy: "fixture-uploader",
      metadata: { title: `Fixture ${imageId}`, credit: "Fixture", description: "Synthetic image", source: "Fixture source" },
      cost: "free", valid: true, invalidReasons: {}, usageRights: { category: "staff-photographer" },
      persisted: { value: archived.has(imageId), reasons: archived.has(imageId) ? ["archived"] : [] },
      userMetadata: { data: { lastModified: new Date(Date.UTC(2026, 10, 7) + connectedVersion * 1000).toISOString(),
        labels: { data: (connected ? imageId === "fixture" ? connectedLabels : otherLabels.get(imageId) ?? ["news"] : ["news"]).map(data => ({ data })) }, archived: { uri: `${metadataOrigin}/metadata/${imageId}/archived`, data: archived.has(imageId) },
        metadata: {}, usageRights: {}, photoshoot: { data: shoots.get(imageId) } } },
      source: { dimensions: { width: 800, height: 600 }, mimeType: "image/jpeg" },
      thumbnail: { secureUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", dimensions: { width: 1, height: 1 } },
      usages: { data: [] }, leases: { data: { leases: [] } }, collections: [],
    },
  });
  let heldProjection: ReturnType<typeof imageEntity> | undefined;
  let readbackHold: (() => Promise<void>) | undefined;
  const escaped: string[] = [];
  const assertEditorReads = () => expect(requests.filter(request => !(request.origin === metadataOrigin && request.method === "GET" && request.path === "/") && !(request.origin === config.mediaApiUri
    && ((request.method === "GET" && ["/", "/usage/quotas", "/images/fixture", "/images/other"].includes(request.path))
      || (request.method === "POST" && GRID_API_READ_VIA_POST.includes(request.path)))))).toEqual([]);
  await context.addCookies([{ name: "fixture-session", value: "synthetic", domain: ".example.test", path: "/", secure: true, sameSite: "None" }]);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) {
      if (url.pathname === "/" || url.pathname === "/search") {
        const html = (await readFile(resolve(outDir, "index.html"), "utf8"))
          .replace("<head>", `<head><script>window.__KUPUA_CONFIG__=${JSON.stringify(config)}</script>`)
          .replace("</body>", '<script type="module" src="/assets/kupua/assets/commands.js"></script></body>');
        await route.fulfill({ contentType: "text/html", body: html, headers: {
          "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.example.test ${metadataOrigin} ${authOrigin}`,
        } });
      } else if (url.pathname.startsWith("/assets/kupua/")) {
        const file = resolve(outDir, url.pathname.slice("/assets/kupua/".length));
        if (!file.startsWith(`${outDir}/`)) { await route.abort(); return; }
        const contentType = extname(file) === ".css" ? "text/css" : extname(file) === ".wasm" ? "application/wasm" : extname(file) === ".svg" ? "image/svg+xml" : "text/javascript";
        await route.fulfill({ body: await readFile(file), contentType });
      } else { escaped.push(url.pathname); await route.abort(); }
      return;
    }
    if (![config.mediaApiUri, metadataOrigin, authOrigin].includes(url.origin)) { escaped.push(url.origin); await route.abort(); return; }
    requests.push({ method: request.method(), origin: url.origin, path: url.pathname, cookie: (await request.allHeaders()).cookie ?? "" });
    let body: unknown = { data: [], total: 0 };
    if (url.origin === config.mediaApiUri && url.pathname === "/") body = { links: [{ rel: "edits", href: metadataOrigin }, { rel: "archive", href: `${metadataOrigin}/metadata/{id}/archived` }, { rel: "session", href: `${authOrigin}/session` }] };
    if (connected && url.origin === config.mediaApiUri && url.pathname === "/images/search-after") body = {
      data: [imageEntity("fixture")], total: 1, sortValues: [[Date.UTC(2026, 0, 1), "fixture"]],
    };
    if (connected && url.origin === config.mediaApiUri && url.pathname === "/images/count") body = { total: request.postDataJSON().since ? 0 : 1 };
    if (url.origin === config.mediaApiUri && /^\/images\/(fixture|other|queued)$/.test(url.pathname)) body = imageEntity(url.pathname.split("/").at(-1)!);
    if (url.origin === config.mediaApiUri && url.pathname === "/images/mget") {
      if (heldMetadata) await heldMetadata;
      body = { data: (request.postDataJSON().ids as string[])
        .map(imageId => imageId === "fixture" && heldProjection ? heldProjection : imageEntity(imageId)) };
      await readbackHold?.();
    }
    if (url.origin === authOrigin) body = { data: { user: { permissions: {} } } };
    const imageId = url.pathname.split("/")[2];
    const labels = connected ? imageId === "fixture" ? connectedLabels : otherLabels.get(imageId) ?? ["news"] : ["fixture label"];
    if (url.origin === metadataOrigin) body = { data: { photoshoot: { uri: `${metadataOrigin}/metadata/${imageId}/photoshoot`, data: shoots.get(imageId) }, labels: { uri: `${metadataOrigin}/metadata/${imageId}/labels`,
      data: labels.map(label => ({
        uri: `${metadataOrigin}/metadata/${imageId}/labels/${new URLSearchParams({ label }).toString().slice(6)}`, data: label,
      })) } } };
    const status = url.origin === metadataOrigin && ["POST", "DELETE"].includes(request.method()) ? writeStatus : 200;
    if (connected && url.origin === metadataOrigin && url.pathname === `/metadata/${imageId}/photoshoot` && request.method() === "PUT") {
      shoots.set(imageId, request.postDataJSON().data); connectedVersion++;
    }
    if (connected && url.origin === metadataOrigin && url.pathname === `/metadata/${imageId}/archived` && request.method() === "PUT") {
      if (request.postDataJSON().data === true) archived.add(imageId);
      else if (request.postDataJSON().data === false) archived.delete(imageId);
      connectedVersion++;
    }
    if (connected && url.origin === metadataOrigin && status === 200 && ["POST", "DELETE"].includes(request.method())) {
      const updated = request.method() === "POST"
        ? [...new Set([...labels, ...(request.postDataJSON().data as string[])])]
        : labels.filter(label => label !== decodeURIComponent(url.pathname.split("/").at(-1)!.replace(/\+/g, " ")));
      if (imageId === "fixture") connectedLabels = updated;
      else otherLabels.set(imageId, updated);
      connectedVersion++;
    }
    await route.fulfill({ status, json: status === 419 ? { errorKey: "authentication-expired" } : body,
      headers: { "Access-Control-Allow-Origin": appOrigin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
  });
  try {
    await page.goto(appOrigin);
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await expect(page.locator("#root")).not.toBeEmpty();
    const execute = () => page.evaluate((command) => (window as CommandWindow).commandFixture.executeGridCommand(command), labelCommand(metadataOrigin));
    expect((await execute()).outcome).toBe("blocked");
    expect(requests.filter((request) => request.origin === authOrigin || (request.origin === metadataOrigin && (request.method !== "GET" || request.path !== "/")))).toEqual([]);
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate("fixture"));
    await expect(page.getByRole("button", { name: "Edit Taken on", exact: true })).toBeEnabled();
    const metadataLabels = (await page.locator("dl dt").allTextContents()).map(label => label.trim());
    expect(metadataLabels.filter(label => ["Special instructions", "Taken on", "By", "Credit", "Location", "Copyright"].includes(label))).toEqual([
      "Special instructions", "Taken on", "By", "Credit", "Location", "Copyright",
    ]);
    for (const name of ["Image type", "Photoshoot"]) {
      expect(await page.getByRole("button", { name: `Edit ${name}`, exact: true }).evaluate(button => {
        const heading = button.closest("dt")!;
        return heading.nextElementSibling!.getBoundingClientRect().top >= heading.getBoundingClientRect().bottom;
      })).toBe(true);
    }
    const additional = page.getByRole("region", { name: "Additional metadata", exact: true });
    await expect(additional.getByRole("button", { name: "Fixture source", exact: true })).toBeHidden();
    await additional.getByRole("button", { name: "Show additional metadata", exact: true }).click();
    const source = additional.getByRole("button", { name: "Fixture source", exact: true });
    await expect(source).toBeVisible();
    const creditLeft = await page.getByRole("button", { name: "Edit Credit", exact: true }).evaluate(button =>
      button.closest("dt")!.nextElementSibling!.getBoundingClientRect().left);
    expect(await source.evaluate(button => button.closest("dd")!.getBoundingClientRect().left)).toBeGreaterThan(creditLeft);
    await additional.getByRole("button", { name: "Hide additional metadata", exact: true }).click();
    await expect(source).toBeHidden();
    const pencilEdges: number[] = [];
    for (const name of ["Title", "Description", "Special instructions", "By", "Credit", "Copyright", "Taken on", "Image type", "Location", "Photoshoot"]) {
      const pencil = page.getByRole("button", { name: `Edit ${name}`, exact: true });
      await expect(pencil).toBeEnabled();
      pencilEdges.push((await pencil.boundingBox())!.x + (await pencil.boundingBox())!.width);
    }
    expect(Math.max(...pencilEdges) - Math.min(...pencilEdges)).toBeLessThan(1);
    await page.getByRole("button", { name: "Edit Title", exact: true }).click();
    const titleInput = page.getByRole("textbox", { name: "Title", exact: true });
    expect(await titleInput.evaluate((input: HTMLTextAreaElement) => input.selectionStart === input.value.length && input.selectionEnd === input.value.length)).toBe(true);
    await titleInput.fill("Prepared title only");
    await titleInput.press("Control+Enter");
    await expect(page.getByText("Not sent - Title change prepared for 1 image.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel Title", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit Title", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Edit Image type", exact: true }).click();
    expect(await page.getByLabel("Image type", { exact: true }).evaluate(select => ["ArrowLeft", "ArrowRight"].map(key => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      select.dispatchEvent(event);
      return event.defaultPrevented;
    }))).toEqual([false, false]);
    await page.getByRole("button", { name: "Cancel Image type", exact: true }).click();
    await page.getByRole("button", { name: "Edit Taken on", exact: true }).click();
    await expect(page.getByRole("group", { name: "Taken on", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear Taken on", exact: true })).toBeDisabled();
    const day = page.getByRole("textbox", { name: "Day", exact: true });
    await day.fill("11");
    const month = page.getByRole("textbox", { name: "Month", exact: true });
    await expect(month).toBeFocused();
    await month.press("ArrowLeft");
    await expect(day).toBeFocused();
    for (const [name, value] of [["Month", "11"], ["Year", "2026"], ["Hours", "10"], ["Minutes", "20"], ["Seconds", "30"], ["Milliseconds", "456"]]) {
      await page.getByRole("textbox", { name, exact: true }).fill(value);
    }
    await day.press("Control+a");
    await day.press("Backspace");
    await expect(day).toHaveValue("11");
    await expect(page.getByRole("textbox", { name: "Year", exact: true })).toHaveValue("2026");
    await expect(page.getByRole("button", { name: "Choose date and time", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Commit Taken on", exact: true }).click();
    await expect(page.getByText("Not sent - Taken on change prepared for 1 image.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel Taken on", exact: true }).click();
    const creditOptions = async (route: import("@playwright/test").Route) => route.fulfill({ json: {
      fields: { "metadata.credit": { buckets: [{ key: "Reuters", count: 2 }] } }, isFilterCounts: {},
    }, headers: { "Access-Control-Allow-Origin": appOrigin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
    await page.route("**/images/aggregations", creditOptions);
    try {
      await page.getByRole("button", { name: "Edit Credit", exact: true }).click();
      const credit = page.getByRole("combobox", { name: "Credit", exact: true });
      expect(await credit.evaluate((input: HTMLInputElement) => input.selectionStart === input.value.length && input.selectionEnd === input.value.length)).toBe(true);
      await credit.fill("Re");
      const suggestions = page.getByRole("listbox", { name: "Suggestions for Credit", exact: true });
      await expect(suggestions).toBeVisible();
      expect((await suggestions.boundingBox())!.width).toBeGreaterThan((await credit.boundingBox())!.width + 20);
      await credit.press("Escape");
      await expect(credit).toBeVisible();
      await expect(credit).toHaveValue("Re");
      await expect(suggestions).toHaveCount(0);
      await page.getByRole("button", { name: "Cancel Credit", exact: true }).click();
    } finally { await page.unroute("**/images/aggregations", creditOptions); }
    const realInput = page.getByRole("combobox", { name: "Add label", exact: true }).filter({ visible: true });
    const realPlus = page.getByRole("button", { name: "Add label", exact: true });
    await realPlus.click();
    await expect(realInput).toBeVisible();
    const entryBounds = (await realInput.boundingBox())!;
    expect(await realInput.evaluate(input => Math.abs(input.getBoundingClientRect().width - input.closest("form")!.getBoundingClientRect().width))).toBeLessThan(1);
    expect((await page.getByRole("button", { name: "Add label to images", exact: true }).boundingBox())!.y).toBeGreaterThanOrEqual(entryBounds.y + entryBounds.height);
    await realInput.fill("cold-detail");
    await realInput.press("Enter");
    await expect(page.getByText("Not sent - Add label: cold-detail", { exact: true })).toBeVisible();
    await realPlus.click();
    await realInput.fill("keep this input");
    await Promise.all([page.waitForEvent("dialog").then(async prompt => {
      const observed = [prompt.type(), prompt.message()];
      await prompt.accept();
      expect(observed).toEqual(["confirm", "Discard your Labels edit?"]);
    }), page.evaluate(() => (window as CommandWindow).editorFixture.navigate())]);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture"]));
    await realPlus.click();
    await expect(realInput).toHaveValue("");
    await realInput.fill("off-screen");
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeEnabled();
    heldMetadata = new Promise<void>(resolve => { releaseMetadata = resolve; });
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["other"]));
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeDisabled();
    await expect(realInput).toHaveValue("off-screen");
    releaseMetadata!();
    heldMetadata = undefined;
    await expect(page.getByRole("button", { name: "Add label to images", exact: true })).toBeEnabled();
    await realInput.press("Enter");
    await expect(page.getByText("Not sent - Add label: off-screen", { exact: true })).toBeVisible();
    await page.evaluate(() => (window as CommandWindow).editorFixture.focus("fixture"));
    const keyboardRemove = page.getByRole("button", { name: "Remove news", exact: true });
    await keyboardRemove.focus();
    await keyboardRemove.press("Enter");
    await expect(page).not.toHaveURL(/image=/);
    await expect(page.getByText("Not sent - Remove label: news", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("label-editor-desktop.png") });
    assertEditorReads();
    await realPlus.click();
    await realInput.fill("Unfinished label");
    const warning = page.waitForEvent("dialog");
    const navigation = page.goto(appOrigin);
    const dialog = await warning;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.accept();
    await navigation;
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await exerciseObservedRemoval(page, "unknown");
    assertEditorReads();
    await discardOnNavigation(page, () => page.goto(appOrigin));
    await page.waitForFunction(() => Boolean((window as CommandWindow).commandFixture));
    await page.setViewportSize({ width: 390, height: 844 });
    const touch = await context.newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await page.evaluate(() => (window as CommandWindow).editorFixture.select(["fixture", "other"]));
    const sheet = page.getByRole("region", { name: "Details", exact: true });
    const editCredit = sheet.getByRole("button", { name: "Edit Credit", exact: true });
    await expect(editCredit).toBeVisible();
    await expect.poll(() => editCredit.evaluate(button => {
      const label = button.closest("dt")!;
      const labelBounds = label.getBoundingClientRect();
      const valueBounds = label.nextElementSibling!.getBoundingClientRect();
      const firstLine = (element: Element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
          if (!text.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(text);
          const rect = range.getClientRects()[0];
          if (rect?.height) return rect.top;
        }
        return NaN;
      };
      const readOnlyValues = [...label.closest("dl")!.querySelectorAll(".metadata-row:not([data-metadata-field]) > dd")]
        .filter(value => !value.closest('[aria-label="Additional metadata"]') && value.getClientRects().length > 0);
      return labelBounds.right <= valueBounds.left
        && Math.abs(firstLine(label) - firstLine(label.nextElementSibling!)) <= 1
        && readOnlyValues.length > 0
        && readOnlyValues.every(value => Math.abs(value.getBoundingClientRect().left - valueBounds.left) < 1);
    })).toBe(true);
    await editCredit.click();
    const credit = sheet.getByRole("combobox", { name: "Credit", exact: true });
    await expect(credit).toHaveCSS("height", "36px");
    const restoreViewport = await page.evaluateHandle(() => {
      const viewport = window.visualViewport!;
      const height = Object.getOwnPropertyDescriptor(viewport, "height");
      const top = Object.getOwnPropertyDescriptor(viewport, "offsetTop");
      Object.defineProperty(viewport, "height", { configurable: true, value: 360 });
      Object.defineProperty(viewport, "offsetTop", { configurable: true, value: 0 });
      viewport.dispatchEvent(new Event("resize"));
      return () => {
        if (height) Object.defineProperty(viewport, "height", height); else Reflect.deleteProperty(viewport, "height");
        if (top) Object.defineProperty(viewport, "offsetTop", top); else Reflect.deleteProperty(viewport, "offsetTop");
        viewport.dispatchEvent(new Event("resize"));
      };
    });
    try {
      await expect(sheet).toHaveCSS("height", "270px");
      await expect(credit).toBeFocused();
      const bounds = (await credit.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(360);
    } finally {
      await restoreViewport.evaluate(restore => restore());
      await restoreViewport.dispose();
    }
    await sheet.getByRole("button", { name: "Cancel Credit", exact: true }).click();
    const remove = page.getByRole("button", { name: "Remove news from all selected images", exact: true });
    await expect(remove).toHaveAttribute("title", "Remove label from all 2 images");
    await remove.scrollIntoViewIfNeeded();
    const bounds = await remove.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(36);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const activity = sheet.getByRole("complementary", { name: "Label activity" });
    await expect(activity).toHaveCount(0);
    await expect(page.getByText("Not sent - Remove label: news", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await expect(sheet).toHaveCSS("width", "480px");
    await sheet.screenshot({ path: testInfo.outputPath("metadata-landscape.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    expect(await page.evaluate(() => (window as CommandWindow).editorFixture.appReceipts().at(-1)?.intent))
      .toMatchObject({ action: "remove", label: "news", targetIds: ["fixture", "other"] });
    await remove.focus();
    await expect(remove).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("label-editor-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    assertEditorReads();
    await touch.detach();
    await applyEditingFromPanel(page, true, false, testInfo.outputPath("hi-joshua-compact.png"));
    expect((await execute()).outcome).toBe("acknowledged");
    const writes = () => requests.filter((request) => request.origin === metadataOrigin && request.method === "POST");
    expect(writes()).toEqual([{ method: "POST", origin: metadataOrigin, path: "/metadata/fixture/labels", cookie: "fixture-session=synthetic" }]);
    const removal = { operation: "remove-label", imageId: "fixture", label: "fixture label", resource: labelCommand(metadataOrigin).resource };
    const executeRemoval = () => page.evaluate(command => (window as CommandWindow).commandFixture.executeGridCommand(command), removal);
    expect((await executeRemoval()).outcome).toBe("acknowledged");
    writeStatus = 503;
    expect((await executeRemoval()).outcome).toBe("unknown");
    expect(requests.filter(request => request.method === "DELETE")).toEqual(Array.from({ length: 2 }, () => ({
      method: "DELETE", origin: metadataOrigin, path: "/metadata/fixture/labels/fixture+label", cookie: "fixture-session=synthetic",
    })));
    writeStatus = 419;
    expect((await execute()).outcome).toBe("rejected");
    const afterExpiry = requests.length;
    expect((await execute()).outcome).toBe("blocked");
    expect(requests).toHaveLength(afterExpiry);
    expect(writes()).toHaveLength(2);
    expect(escaped).toEqual([]);
    connected = true;
    writeStatus = 200;
    await page.evaluate(() => (window as CommandWindow).editorFixture.select([]));
    await page.setViewportSize({ width: 1280, height: 900 });
    const desktop = await context.newCDPSession(page);
    await desktop.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await desktop.detach();
    await discardOnNavigation(page, () => page.goto(appOrigin));
    await page.waitForFunction(() => Boolean((window as CommandWindow).editorFixture));
    let beforeConnected = requests.length;
    await exerciseConnectedEditor(page, () => { beforeConnected = requests.length; });
    expect(requests.slice(beforeConnected).filter(request => request.origin === metadataOrigin && ["POST", "DELETE"].includes(request.method)))
      .toEqual(["POST", "DELETE"].map(method => ({ method, origin: metadataOrigin, cookie: "fixture-session=synthetic",
        path: method === "POST" ? "/metadata/fixture/labels" : "/metadata/fixture/labels/connected+fixture+label" })));
    expect(requests.slice(beforeConnected).filter(request => request.path === "/images/mget")).toHaveLength(2);
    expect(connectedLabels).toEqual(["news"]);
    const beforeBulk = requests.length;
    await exerciseBulkEditor(page, hold => { readbackHold = hold; });
    expect(requests.slice(beforeBulk).filter(request => request.origin === metadataOrigin && ["POST", "DELETE"].includes(request.method))
      .map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "POST", path: "/metadata/fixture/labels" }, { method: "POST", path: "/metadata/other/labels" },
      { method: "POST", path: "/metadata/queued/labels" },
      { method: "DELETE", path: "/metadata/fixture/labels/batch+fixture+label" }, { method: "DELETE", path: "/metadata/other/labels/batch+fixture+label" },
      { method: "POST", path: "/metadata/other/labels" }, { method: "DELETE", path: "/metadata/other/labels/partial+fixture+label" },
    ]);
    expect(connectedLabels).toEqual(["news"]);
    expect(otherLabels.get("other")).toEqual(["news"]);
    const beforeRecovery = requests.length;
    await exerciseRecoveryEditor(page, hold => { heldProjection = hold ? imageEntity("fixture") : undefined; });
    expect(requests.slice(beforeRecovery).filter(request => request.origin === metadataOrigin && request.method === "POST")
      .map(request => request.path)).toEqual(["/metadata/fixture/labels", "/metadata/other/labels", "/metadata/fixture/labels", "/metadata/other/labels"]);
    await page.screenshot({ path: testInfo.outputPath("bulk-labels-hosted.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const compact = await context.newCDPSession(page);
    try {
      await compact.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const sheet = page.getByRole("region", { name: "Details", exact: true });
      await expect(sheet).toBeInViewport();
      await expect(sheet.getByRole("complementary", { name: "Label activity" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("bulk-labels-compact.png") });
    } finally {
      await compact.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await compact.detach();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => (window as CommandWindow).editorFixture.navigate("fixture"));
    await page.getByRole("button", { name: "Edit Photoshoot", exact: true }).click();
    await page.getByLabel("Photoshoot", { exact: true }).fill("Hosted assignment");
    const beforeShoot = requests.length;
    await page.getByRole("button", { name: "Commit Photoshoot", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit Photoshoot", exact: true })).toBeEnabled();
    await expect(page.getByText("Hosted assignment", { exact: true })).toBeVisible();
    expect(requests.slice(beforeShoot).filter(request => request.method === "PUT").map(request => [request.origin, request.path])).toEqual([[metadataOrigin, "/metadata/fixture/photoshoot"]]);
    const beforeLibrary = requests.length;
    await page.getByRole("button", { name: "Add to Library", exact: true }).click();
    await page.getByRole("button", { name: "Remove from Library", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add to Library", exact: true })).toBeEnabled();
    expect(requests.slice(beforeLibrary).filter(request => request.method === "PUT").map(request => [request.origin, request.path])).toEqual(Array(2).fill([metadataOrigin, "/metadata/fixture/archived"]));
    expect(escaped).toEqual([]);
  } finally {
    releaseMetadata?.();
    await page.unrouteAll({ behavior: "wait" });
  }
});