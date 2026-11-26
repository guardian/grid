import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import MCR from 'monocart-coverage-reports';
import type { CoverageReportOptions } from 'monocart-coverage-reports';

const coverageOptions = {
    name: 'Playwright Browser Coverage',
    outputDir: process.env.GRID_COVERAGE_DIR ?? './coverage-reports',
    reports: [
        ['v8', { metrics: ['branches', 'functions', 'lines'] }],
        ['console-summary', { metrics: ['branches', 'functions', 'lines'] }],
        'lcovonly'
    ],
    outputFilter: (entry) =>
        /(^|[/\\])public[/\\]js[/\\]/.test(entry.sourcePath) &&
        !/\.(?:html?|css(?:-[^/\\?#]*)?)(?:[?#]|$)/i.test(entry.sourcePath),
    sourceMapResolver: async (url, defaultResolver) => {
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
    cleanCache: false,
    // Generating a report would otherwise wipe the per-feature/scenario dirs nested in it; global setup clears stale output.
    clean: false
} satisfies CoverageReportOptions;

export default coverageOptions;

export const FEATURE_COVERAGE_DIR = `${coverageOptions.outputDir}/features`;
export const SCENARIOS_DIR_NAME = 'scenarios';
export const TITLE_FILE = 'title.txt';

/** Turns a generated spec path (e.g. `features/search/free-text.feature.spec.js`) into a directory name. */
function featureSlug(testFile: string): string {
    return testFile
        .replace(/\\/g, '/')
        .replace(/^features\//, '')
        .replace(/\.feature\.spec\.[cm]?[jt]s$/, '')
        .replace(/\//g, '__')
        .replace(/[^\w-]+/g, '-');
}

// The hash keeps truncated or similarly-worded scenario titles from colliding.
function scenarioSlug(title: string): string {
    const hash = createHash('sha1').update(title).digest('hex').slice(0, 8);
    const readable = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    return `${readable}-${hash}`;
}

export function reportOptions(outputDir: string, title: string): CoverageReportOptions {
    return {
        ...coverageOptions,
        name: `Coverage: ${title}`,
        outputDir,
        reports: [['v8', { metrics: ['branches', 'functions', 'lines'] }]]
    };
}

/** Adds a test's coverage to the combined, per-feature and per-scenario caches. */
export async function addCoverage(titlePath: string[], entries: unknown[]): Promise<void> {
    // playwright-bdd titlePath: [spec file, feature, ...rule/outline/scenario]
    const [file, feature = file, ...scenarioPath] = titlePath;
    const scenario = scenarioPath.join(' › ') || feature;
    const featureDir = `${FEATURE_COVERAGE_DIR}/${featureSlug(file)}`;
    const scenarioDir = `${featureDir}/${SCENARIOS_DIR_NAME}/${scenarioSlug(scenario)}`;
    await Promise.all([[featureDir, feature], [scenarioDir, scenario]].map(async ([dir, title]) => {
        await mkdir(dir, { recursive: true });
        await writeFile(`${dir}/${TITLE_FILE}`, title);
    }));
    await MCR(coverageOptions).add(entries);
    await MCR(reportOptions(featureDir, feature)).add(entries);
    await MCR(reportOptions(scenarioDir, scenario)).add(entries);
}
