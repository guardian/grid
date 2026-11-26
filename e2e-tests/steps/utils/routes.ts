import type { Page, Request } from '@playwright/test';
import { KAHUNA_APP_URL } from '../setup.ts';

/** Which requests a route applies to: a URL test and, optionally, the methods it handles. */
export interface RequestMatch {
  url: (url: URL) => boolean;
  methods?: string[];
}

/**
 * Route the requests `match` selects, passing every other request on to earlier routes (or
 * the network), so routes on the same URLs can be layered.
 */
async function routeMatching(
  page: Page,
  { url, methods }: RequestMatch,
  handle: Parameters<Page['route']>[1],
): Promise<void> {
  await page.route(url, async (route, request) => {
    if (methods && !methods.includes(request.method())) return route.fallback();
    return handle(route, request);
  });
}

/**
 * Hold each request `match` selects until `until(request)` resolves, then let it through, or
 * abort it if `thenAbort` is set.
 */
export async function holdRequests(
  page: Page,
  match: RequestMatch,
  until: (request: Request) => Promise<unknown>,
  { thenAbort = false }: { thenAbort?: boolean } = {},
): Promise<void> {
  await routeMatching(page, match, async (route, request) => {
    await until(request);
    await (thenAbort ? route.abort() : route.fallback());
  });
}

/** Hold each request `match` selects until the returned function is called. */
export async function holdRequestsUntilReleased(page: Page, match: RequestMatch): Promise<() => void> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await holdRequests(page, match, () => released);
  return release;
}

/** How `failRequests` fails a request: aborted, or answered with an error response. */
export type Failure =
  | { abort: true }
  | {
      status: number;
      body?: string;
      json?: unknown;
      /** Make the response readable cross-origin, so Kahuna sees the failure rather than a CORS error. */
      cors?: boolean;
    };

/** Fail every request `match` selects. */
export async function failRequests(page: Page, match: RequestMatch, failure: Failure): Promise<void> {
  await routeMatching(page, match, async (route) => {
    if ('abort' in failure) return route.abort();
    const { status, body, json, cors } = failure;
    await route.fulfill({
      status,
      body,
      json,
      headers: cors
        ? { 'Access-Control-Allow-Origin': KAHUNA_APP_URL, 'Access-Control-Allow-Credentials': 'true' }
        : undefined,
    });
  });
}
