import { test as base, expect } from '@playwright/test';
import MCR from 'monocart-coverage-reports';
import coverageOptions from './mcr.config.js';

const test = base.extend({
    coverage: [async ({ page, browserName }, use) => {
        if (browserName !== 'chromium') {
            throw new Error('Native JS/CSS coverage requires Chromium');
        }

        // Start before beforeEach/test navigation executes application code.
        await Promise.all([
            page.coverage.startJSCoverage({
                resetOnNavigation: false
            }),
            page.coverage.startCSSCoverage({
                resetOnNavigation: false
            })
        ]);
        try {
            await use();
        } finally {
            // Persist data before Playwright closes the page, even if an assertion fails.
            const [js, css] = await Promise.all([
                page.coverage.stopJSCoverage(),
                page.coverage.stopCSSCoverage()
            ]);
            await MCR(coverageOptions).add([...js, ...css]);
        }
    }, {
        auto: true
    }]
});

export { test, expect };