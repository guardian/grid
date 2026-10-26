import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.ts';

/**
 * Records a video of every test, with a pause after each browser action so viewers can follow along.
 * Used to capture scenario recordings for PR descriptions (`npm run test:video:paced`).
 */
export default defineConfig(baseConfig, {
    use: {
        video: { ...(baseConfig.use?.video as object), mode: 'on' },
        launchOptions: { slowMo: 1_000 },
    },
    // Pausing after every action makes scenarios much slower than the default timeout allows.
    timeout: 3 * 60 * 1000,
});
