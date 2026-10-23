import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const dashboards = ["audit", "perceived"] as const;
type Dashboard = typeof dashboards[number];

async function loadDashboard(page: Page, dashboard: Dashboard) {
  await page.route("**/*", route => route.abort());
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  const entries = [10, 20, 30].map((value, index) => ({
    label: `Fixture ${index + 1}`,
    timestamp: `2026-01-0${index + 1}T12:00:00Z`,
    gitSha: "fixture",
    runs: 3,
    environment: { dataMode: "direct-es" },
    ...(dashboard === "audit" ? {
      metrics: {
        P1: { severeRate: value, severe: value, maxFrame: value, frameCount: 100, scenarioRevision: index === 1 ? 2 : 1 },
        P2: { severeRate: 100, severe: 1, frameCount: 10 },
      },
    } : {
      perceived: {
        PP1: { label: "Fixture action", action: "home-logo", dt_ack_ms: value, dt_store_ready_ms: value, scenarioRevision: index === 1 ? 2 : 1 },
      },
    }),
  }));
  const bootstrap = `<script>
    window.__AUDIT_LOG__ = ${JSON.stringify({ entries: dashboard === "audit" ? entries : [] })};
    window.__PERCEIVED_LOG__ = ${JSON.stringify({ entries })};
    window.__chartConfigs = new Map();
    window.Chart = class {
      constructor(context, config) {
        this.id = context.canvas.id;
        window.__chartConfigs.set(this.id, config);
      }
      destroy() { window.__chartConfigs.delete(this.id); }
    };
  </script>`;
  const html = readFileSync(new URL(`../results/${dashboard}-graphs.html`, import.meta.url), "utf8")
    .replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace("<head>", `<head>${bootstrap}`);
  await page.setContent(html);
  await expect(page.getByRole("status", { name: "Metric guide" })).toBeVisible();
  return { requests, errors };
}

for (const dashboard of dashboards) {
  test(`${dashboard}: metric buttons, dropdown and keyboard share bounded navigation and complete help`, async ({ page }) => {
    const { requests, errors } = await loadDashboard(page, dashboard);
    const metric = page.getByRole("combobox", { name: "Metric", exact: true });
    const previous = page.getByRole("button", { name: "Previous metric", exact: true });
    const next = page.getByRole("button", { name: "Next metric", exact: true });
    const guide = page.getByRole("status", { name: "Metric guide" });
    const values = await metric.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    await expect(previous).toBeDisabled();
    await expect(metric).toHaveValue(values[0]);
    await next.click();
    await expect(metric).toHaveValue(values[1]);
    await expect(previous).toBeEnabled();
    await page.keyboard.press("ArrowRight");
    await expect(metric).toHaveValue(values[2]);
    await page.keyboard.press("ArrowLeft");
    await expect(metric).toHaveValue(values[1]);
    await previous.click();
    await expect(metric).toHaveValue(values[0]);
    await expect(previous).toBeDisabled();

    for (const value of values) {
      await metric.selectOption(value);
      const label = await metric.locator("option:checked").textContent();
      await expect(guide).toContainText(label!);
      await expect(guide).not.toContainText(/undefined|No description/);
      expect((await guide.textContent())!.length).toBeGreaterThan(label!.length + 20);
    }
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(next).toBeEnabled();
    await expect(metric).toHaveValue(values[values.length - 2]);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${dashboard}: arrows are left to form controls and nested editable content`, async ({ page }) => {
    const { requests, errors } = await loadDashboard(page, dashboard);
    const metric = page.getByRole("combobox", { name: "Metric", exact: true });
    const originalValue = await metric.inputValue();
    await page.evaluate(() => {
      const fixture = document.createElement("div");
      fixture.id = "editing-fixture";
      fixture.innerHTML = '<input aria-label="Text"><textarea aria-label="Notes"></textarea><select aria-label="Other"><option>One</option></select><div contenteditable="true"><span id="editable-child">Editable text</span></div>';
      document.body.append(fixture);
    });
    for (const selector of ["#metric", "#editing-fixture input", "#editing-fixture textarea", "#editing-fixture select", "#editable-child"]) {
      for (const key of ["ArrowLeft", "ArrowRight"]) {
        const allowed = await page.locator(selector).evaluate((element, key) =>
          element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })), key);
        expect(allowed).toBe(true);
        await expect(metric).toHaveValue(originalValue);
      }
    }
    const allowed = await page.locator("body").evaluate(element =>
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true })));
    expect(allowed).toBe(true);
    await expect(metric).toHaveValue(originalValue);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${dashboard}: navigation retains comparable series and tooltip callbacks`, async ({ page }) => {
    const { requests, errors } = await loadDashboard(page, dashboard);
    const points = () => page.evaluate(() => {
      const configs = (window as unknown as { __chartConfigs: Map<string, { data: { datasets: { data: (number | null)[] }[] } }> }).__chartConfigs;
      return [...configs.values()][0].data.datasets[0].data;
    });
    await expect.poll(points).toEqual([10, null, 30]);
    await expect(page.locator("#grid .card")).toHaveCount(1);
    await page.getByRole("button", { name: "Next metric", exact: true }).click();
    await page.getByRole("button", { name: "Previous metric", exact: true }).click();
    await expect.poll(points).toEqual([10, null, 30]);
    await expect(page.locator("#grid .card")).toHaveCount(1);
    await page.getByLabel("comparable within each mode").uncheck();
    await expect.poll(points).toEqual([10, 20, 30]);
    const tooltip = await page.evaluate(() => {
      const configs = (window as unknown as { __chartConfigs: Map<string, { options: { plugins: { tooltip: { callbacks: Record<string, (...args: any[]) => string> } } } }> }).__chartConfigs;
      const callbacks = [...configs.values()][0].options.plugins.tooltip.callbacks;
      return {
        label: callbacks.label({ dataset: { label: "direct ES" }, raw: 30, parsed: { y: 30 } }),
        title: callbacks.title?.([{ dataIndex: 2 }]),
        detail: callbacks.afterLabel?.({ dataIndex: 2 }),
      };
    });
    expect(tooltip.label).toContain("direct ES: 30");
    if (dashboard === "audit") {
      expect(tooltip.title).toContain("Fixture 3");
      expect(tooltip.detail).toContain("runs:3");
    }
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
