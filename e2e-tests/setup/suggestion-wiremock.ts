import type { BrowserContext, Route } from '@playwright/test';
import { GenericContainer, Wait } from 'testcontainers';
import { API_KEY, DOMAIN, MEDIA_API_PORT, SERVICE_PORTS } from './constants.ts';
import { loadImageFixtures } from './image-fixtures.ts';
import { SEARCH_CHIP_IMAGE_IDS } from '../fixtures/elasticsearch/search-chips.ts';

const API_ORIGIN = `https://api.media.${DOMAIN}`;
const EDITS_ORIGIN = `https://media-metadata.${DOMAIN}`;

function fixture(role: string) {
    const hit = loadImageFixtures().find((image) => image._id === SEARCH_CHIP_IMAGE_IDS[role]);
    if (!hit) throw new Error(`Missing search-chip fixture ${role}`);
    return hit._source;
}

async function getJson(url: string) {
    const response = await fetch(url, { headers: { 'X-Gu-Media-Key': API_KEY } });
    if (!response.ok) throw new Error(`Cannot prepare suggestion mocks: ${url} returned ${response.status}`);
    return response.json();
}

function prefixPattern(value: string) {
    const prefixes = Array.from({ length: value.length + 1 }, (_, length) =>
        value.slice(0, length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return `(?i)(?:${prefixes.join('|')})`;
}

export async function startSuggestionWireMock() {
    const container = await new GenericContainer('wiremock/wiremock:3.13.1')
        .withExposedPorts(8080)
        .withWaitStrategy(Wait.forHttp('/__admin/mappings', 8080))
        .start();
    const baseUrl = `http://${container.getHost()}:${container.getMappedPort(8080)}`;

    try {
        const [root, catalogue] = await Promise.all([
            getJson(`http://localhost:${MEDIA_API_PORT}/`),
            getJson(`http://localhost:${SERVICE_PORTS['metadata-editor']}/usage-rights/categories`),
        ]);
        const publication = fixture('E').usageRights!.publication as string;
        const external = fixture('A').metadata!.byline as string;
        const internal = fixture('E').usageRights!.photographer as string;
        const contracted = fixture('R').usageRights!.photographer as string;
        const illustrator = fixture('F').usageRights!.creator as string;
        const source = fixture('A').metadata!.source as string;
        const label = (fixture('E').userMetadata as { labels: string[] }).labels[0];
        const legacyCategories = [
            {
                value: 'staff-photographer',
                properties: [{ name: 'photographer', optionsMap: { [publication]: [external, internal] } }],
            },
            {
                value: 'contract-photographer',
                properties: [{ name: 'photographer', optionsMap: { [publication]: [contracted] } }],
            },
            {
                value: 'contract-illustrator',
                properties: [{ name: 'creator', options: [illustrator] }],
            },
            {
                value: fixture('Q').usageRights!.category as string,
                properties: [],
            },
        ];
        const categories = [
            ...catalogue.data.filter((category: { value: string }) =>
                !legacyCategories.some((legacy) => legacy.value === category.value)),
            ...legacyCategories,
        ];
        const rootResponse = {
            ...root,
            links: [
                ...root.links.filter((link: { rel: string }) => link.rel !== 'suggested-labels'),
                { rel: 'suggested-labels', href: `${API_ORIGIN}/suggest/labels{?q}` },
            ],
        };
        const responseHeaders = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': `https://media.${DOMAIN}`,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Gu-Media-Key',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        };
        const mappings = [
            { request: { method: 'GET', urlPath: '/' }, response: { jsonBody: rootResponse } },
            { request: { method: 'GET', urlPath: '/usage-rights/categories' }, response: { jsonBody: { data: categories } } },
            {
                priority: 1,
                request: { method: 'GET', urlPath: '/suggest/metadata/source', queryParameters: { q: { matches: prefixPattern(source) } } },
                response: { jsonBody: { data: [{ key: source, score: 1 }] } },
            },
            {
                priority: 1,
                request: { method: 'GET', urlPath: '/suggest/labels', queryParameters: { q: { matches: prefixPattern(label) } } },
                response: { jsonBody: { data: [label] } },
            },
            {
                priority: 10,
                request: { method: 'GET', urlPathPattern: '/suggest/(metadata/source|labels)' },
                response: { jsonBody: { data: [] } },
            },
            { request: { method: 'OPTIONS', urlPathPattern: '.*' }, response: { status: 204 } },
        ];
        for (const mapping of mappings) {
            const response = await fetch(`${baseUrl}/__admin/mappings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...mapping, response: { status: 200, ...mapping.response, headers: responseHeaders } }),
            });
            if (!response.ok) throw new Error(`Cannot register WireMock suggestion mapping: ${await response.text()}`);
        }

        return {
            baseUrl,
            async intercept(context: BrowserContext) {
                const matches = (url: URL) =>
                    (url.origin === API_ORIGIN && ['/', '/suggest/metadata/source', '/suggest/labels'].includes(url.pathname)) ||
                    (url.origin === EDITS_ORIGIN && url.pathname === '/usage-rights/categories');
                const handler = async (route: Route) => {
                    const original = new URL(route.request().url());
                    const response = await route.fetch({ url: `${baseUrl}${original.pathname}${original.search}` });
                    await route.fulfill({ response });
                };
                await context.route(matches, handler);
                return () => context.unroute(matches, handler);
            },
            stop: () => container.stop(),
        };
    } catch (error) {
        await container.stop();
        throw error;
    }
}