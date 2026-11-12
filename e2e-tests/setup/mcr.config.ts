import { basename } from 'node:path';

export default {
    name: 'Playwright Browser Coverage',
    outputDir: './coverage-reports',
    reports: [
        ['v8', { metrics: ['branches', 'functions', 'lines'] }],
        ['console-summary', { metrics: ['branches', 'functions', 'lines'] }],
        'lcovonly'
    ],
    outputFilter: (entry: { sourcePath: string }) =>
        /(^|[/\\])public[/\\]js[/\\]/.test(entry.sourcePath) &&
        !/\.(?:html?|css(?:-[^/\\?#]*)?)(?:[?#]|$)/i.test(entry.sourcePath),
    sourceMapResolver: async (url: string, defaultResolver: (url: string) => Promise<unknown>) => {
        const { pathname } = new URL(url);
        if (pathname.startsWith('/assets/dist/') && pathname.endsWith('.map')) {
            const localMapUrl = new URL(`../../kahuna/public/dist/${basename(pathname)}`, import.meta.url);
            const sourceMap = await defaultResolver(localMapUrl.href);
            if (sourceMap) {
                return sourceMap;
            }
        }
        return defaultResolver(url);
    },
    // Workers share the cache; only global setup may clear it.
    cleanCache: false
};