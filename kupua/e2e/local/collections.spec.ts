/**
 * CollectionTree e2e tests.
 *
 * Mocks the /grid-collections/collections endpoint so tests run
 * independently of the collections service. The ES aggregation for counts
 * runs against the local Docker ES — if no collection data exists there,
 * counts will be 0, which is fine (tree renders without counts).
 *
 * Run:
 *   npm --prefix kupua run test:e2e -- e2e/local/collections.spec.ts
 */

import { test, expect } from "../shared/helpers";

// ---------------------------------------------------------------------------
// Test fixture — minimal tree: Sport (parent) → Football (child), Travel (leaf)
// ---------------------------------------------------------------------------
//
// Shape matches CollectionsApiResponse { data: CollectionNode, actions: [] }.
// CollectionNode = { uri, data: { basename, children, fullPath, data? }, links, actions }
// The outer "data" is the root CollectionNode; children must also be CollectionNodes.

const TEST_TREE_FIXTURE = {
  // Matches the real API shape: { data: { basename, children: CollectionNode[] }, actions }
  // The root "data" is a BARE object (not a CollectionNode) — fetchCollectionTree
  // synthesises the CollectionNode wrapper. Children ARE full CollectionNodes.
  data: {
    basename: "root",
    children: [
      {
        // Sport CollectionNode
        uri: "https://example.com/collections/sport",
        data: {
          basename: "Sport",
          children: [
            {
              // Football CollectionNode
              uri: "https://example.com/collections/sport/football",
              data: {
                basename: "Football",
                children: [],
                fullPath: ["sport", "football"],
                data: {
                  path: ["sport", "football"],
                  pathId: "sport/football",
                  description: "Football",
                  actionData: { author: "test", date: "2024-01-01" },
                },
              },
              links: [],
              actions: [],
            },
          ],
          fullPath: ["sport"],
          data: {
            path: ["sport"],
            pathId: "sport",
            description: "Sport collection",
            actionData: { author: "test", date: "2024-01-01" },
          },
        },
        links: [],
        actions: [],
      },
      {
        // Travel CollectionNode
        uri: "https://example.com/collections/travel",
        data: {
          basename: "Travel",
          children: [],
          fullPath: ["travel"],
          data: {
            path: ["travel"],
            pathId: "travel",
            description: "Travel collection",
            actionData: { author: "test", date: "2024-01-02" },
          },
        },
        links: [],
        actions: [],
      },
    ],
  },
  actions: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Group 1: with mock — functional tests
// ---------------------------------------------------------------------------

test.describe("CollectionTree — with mock service", () => {
  test.beforeEach(async ({ page }) => {
    // Match the collections service fetch regardless of VITE_COLLECTIONS_URL
    // (may be localhost:9010 in dev or a real TEST URL via .env.local).
    // fetchCollectionTree always appends "/collections" to the base.
    await page.route(
      (url) => url.pathname === "/collections",
      (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(TEST_TREE_FIXTURE),
      }),
    );
  });

  test("renders root-level nodes in left panel", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    await expect(kupua.page.getByText("Sport", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(kupua.page.getByText("Travel", { exact: true })).toBeVisible();
  });

  test("child nodes hidden until parent is expanded", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    await expect(kupua.page.getByText("Sport", { exact: true })).toBeVisible({ timeout: 5000 });
    // Football is a child of Sport — should not be visible yet
    await expect(kupua.page.getByText("Football", { exact: true })).not.toBeVisible();
  });

  test("clicking the expand chevron shows child nodes", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    await expect(kupua.page.getByText("Sport", { exact: true })).toBeVisible({ timeout: 5000 });

    // Sport has one child → one Expand chevron in the tree
    await kupua.page.getByRole("button", { name: "Expand" }).click();

    await expect(kupua.page.getByText("Football", { exact: true })).toBeVisible({ timeout: 3000 });
  });

  test("clicking the collapse chevron hides child nodes", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    await expect(kupua.page.getByText("Sport", { exact: true })).toBeVisible({ timeout: 5000 });

    // Expand
    await kupua.page.getByRole("button", { name: "Expand" }).click();
    await expect(kupua.page.getByText("Football", { exact: true })).toBeVisible({ timeout: 3000 });

    // Collapse
    await kupua.page.getByRole("button", { name: "Collapse" }).click();
    await expect(kupua.page.getByText("Football", { exact: true })).not.toBeVisible();
  });

  test("clicking a collection node adds filter and auto-switches sort", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    const travelNode = kupua.page.getByText("Travel", { exact: true });
    await expect(travelNode).toBeVisible({ timeout: 5000 });

    await travelNode.click();

    // URL should include a collection filter AND sort switched to dateAddedToCollection
    await kupua.page.waitForURL(
      (url) => url.href.includes("collection") && url.searchParams.get("orderBy") === "-dateAddedToCollection",
      { timeout: 5000 },
    );
    const url = new URL(kupua.page.url());
    expect(url.searchParams.get("query")).toContain("collection");
    expect(url.searchParams.get("orderBy")).toBe("-dateAddedToCollection");
  });

  test("clearing a collection query reverts sort to previous", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    // Capture the default sort before clicking a collection
    const defaultSort = new URL(kupua.page.url()).searchParams.get("orderBy") ?? "-uploadTime";

    const travelNode = kupua.page.getByText("Travel", { exact: true });
    await expect(travelNode).toBeVisible({ timeout: 5000 });

    // Click collection → sort should auto-switch
    await travelNode.click();
    await kupua.page.waitForURL(
      (url) => url.searchParams.get("orderBy") === "-dateAddedToCollection",
      { timeout: 5000 },
    );

    // Clear query via the clear button → sort should revert
    await kupua.page.getByRole("button", { name: /clear/i }).click();
    await kupua.page.waitForURL(
      (url) => !url.searchParams.get("query")?.includes("collection"),
      { timeout: 5000 },
    );

    const revertedSort = new URL(kupua.page.url()).searchParams.get("orderBy") ?? "-uploadTime";
    expect(revertedSort).toBe(defaultSort);
  });

  test("clicking an active collection node is a no-op", async ({ kupua }) => {
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    const travelNode = kupua.page.getByText("Travel", { exact: true });
    await expect(travelNode).toBeVisible({ timeout: 5000 });

    // Add filter
    await travelNode.click();
    await kupua.page.waitForURL((url) => url.href.includes("collection"), { timeout: 5000 });
    const urlAfterFirstClick = kupua.page.url();

    // Click again — should be a no-op (active collection click does nothing)
    await travelNode.click();
    // Brief wait to confirm no navigation fires
    await kupua.page.waitForTimeout(500);
    expect(kupua.page.url()).toBe(urlAfterFirstClick);
  });
});

// ---------------------------------------------------------------------------
// Group 2: without mock — graceful-absence path
// ---------------------------------------------------------------------------

test.describe("CollectionTree — graceful absence", () => {
  test("Collections section fully absent when service unavailable", async ({ kupua }) => {
    // No route mock → Vite proxy gets ECONNREFUSED → 502 → status='absent'
    // search.tsx hides the entire AccordionSection when status='absent'.
    await kupua.goto();
    await kupua.page.keyboard.press("Alt+[");

    // Wait for absent state: the whole section (header + content) disappears.
    // The "Collections" accordion header button should not be in the DOM.
    await expect(
      kupua.page.getByRole("button", { name: "Collections", exact: true }),
    ).not.toBeVisible({ timeout: 5000 });

    // Sanity: Filters section is still present
    await expect(kupua.page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  });
});
