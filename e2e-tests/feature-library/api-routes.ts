/**
 * Maps Grid's HATEOAS link and action relation names to the URL paths the Scala services advertise for them,
 * by scraping `Link("rel", uri)` and `Action("rel", uri, "METHOD")` definitions. Best-effort: URIs built in
 * helper functions the scraper can't follow are reported as their source expression.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ApiRoute { method?: string; path: string }
export interface ApiRoutes { links: Map<string, ApiRoute[]>; actions: Map<string, ApiRoute[]> }

/** Config properties holding another service's base URI, keyed by property name. */
const serviceUris: Record<string, string> = {
  metadataUri: 'metadata-editor', cropperUri: 'cropper', authUri: 'auth', collectionsUri: 'collections',
  leasesUri: 'leases', usageUri: 'usage', loaderUri: 'image-loader', mediaApiUri: 'media-api', apiBaseUri: 'media-api',
  apiUri: 'media-api', kahunaUri: 'kahuna', loginUriTemplate: 'auth',
};
const skippedDirs = new Set(['node_modules', 'target', '.git', 'e2e-tests', 'kahuna', 'cdk', 'docs', 'dev']);

/** @returns The argument source texts of the call whose opening parenthesis is at `open`. */
function callArguments(text: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  let quote = false;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (char === '(' || char === '{' || char === '[') depth++;
    else if (char === ')' || char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        args.push(text.slice(start, i).trim());
        return args;
      }
    } else if (char === ',' && depth === 1) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

/** Follows a `val name = ...` in the same file, then returns the first string literal or config URI in the expression. */
function uriTemplate(expression: string, fileText: string, depth = 0): string {
  const name = /^\w+$/.exec(expression)?.[0];
  if (name && depth < 3) {
    const definition = new RegExp(`\\b(?:val|def)\\s+${name}\\b[^=]*=\\s*([^\\n]+)`).exec(fileText);
    if (definition) return uriTemplate(definition[1].trim(), fileText, depth + 1);
  }
  const literal = /s?"([^"]*)"/.exec(expression)?.[1];
  if (literal !== undefined) return literal;
  const config = /config\.(?:services\.)?(\w+)/.exec(expression)?.[1];
  return config ? `\${config.${config}}` : expression;
}

/** Turns `${config.rootUri}/images/$id` into `media-api /images/{id}`. */
function formatPath(template: string, service: string): string {
  const match = /^\$\{?config\.(?:services\.)?(\w+)\}?(.*)$/.exec(template);
  const owner = match ? (match[1] === 'rootUri' ? service : serviceUris[match[1]] ?? match[1]) : undefined;
  const rest = (match ? match[2] : template).replace(/\$\{([\w.]+)\}|\$(\w+)/g, (_, braced, bare) => `{${(braced ?? bare).split('.').at(-1)}}`);
  return owner ? `${owner} ${rest || '/'}` : rest;
}

async function scalaFiles(root: string): Promise<string[]> {
  const top = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const dir of top.filter((entry) => entry.isDirectory() && !skippedDirs.has(entry.name))) {
    const entries = await readdir(path.join(root, dir.name), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(entry.parentPath, entry.name);
      if (entry.isFile() && entry.name.endsWith('.scala') && !/[/\\](target|node_modules)[/\\]/.test(full)) files.push(full);
    }
  }
  return files;
}

/** @param root - Grid repository root. */
export async function loadApiRoutes(root: string): Promise<ApiRoutes> {
  const routes: ApiRoutes = { links: new Map(), actions: new Map() };
  const add = (map: Map<string, ApiRoute[]>, rel: string, route: ApiRoute) => {
    const list = map.get(rel) ?? [];
    if (!list.some((existing) => existing.path === route.path && existing.method === route.method)) list.push(route);
    map.set(rel, list);
  };
  for (const file of await scalaFiles(root)) {
    const text = await readFile(file, 'utf8');
    if (!/\b(?:Argo)?(?:Link|Action)\("/.test(text)) continue;
    const service = path.relative(root, file).split(path.sep)[0];
    for (const match of text.matchAll(/\b(?:Argo)?(Link|Action)\(\s*"([\w-]+)"/g)) {
      const [, kind, rel] = match;
      const args = callArguments(text, match.index + match[0].indexOf('('));
      if (args.length < 2) continue;
      const route = { path: formatPath(uriTemplate(args[1], text), service), method: /"(\w+)"/.exec(args[2] ?? '')?.[1] };
      add(kind === 'Link' ? routes.links : routes.actions, rel, route);
    }
  }
  return routes;
}

/** @returns Display strings such as `DELETE media-api /images/{id}` for an endpoint found in Kahuna. */
export function endpointPaths(routes: ApiRoutes, kind: string, label: string): string[] {
  // fetch and $http calls carry their own URL; a bare variable name gives no path.
  if (kind === 'fetch' || (kind === kind.toUpperCase() && /[/:]/.test(label))) return /[/:]/.test(label) ? [label] : [];
  const actionFirst = kind === 'perform' || kind === 'action';
  const found = actionFirst ? routes.actions.get(label) ?? routes.links.get(label) : routes.links.get(label) ?? routes.actions.get(label);
  const method = kind === 'follow' ? 'GET' : kind === kind.toUpperCase() ? kind : undefined;
  return (found ?? []).map((route) => [route.method ?? method, route.path].filter(Boolean).join(' '));
}
