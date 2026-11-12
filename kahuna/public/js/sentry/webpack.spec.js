/** @jest-environment node */
/* global process, require */

jest.mock('@sentry/webpack-plugin', () => ({
    sentryWebpackPlugin: jest.fn(() => ({ apply() {} }))
}));
jest.mock('../../../webpack.config.shared', () => ({}));
jest.mock('image-minimizer-webpack-plugin', () => class ImageMinimizerPlugin {});

describe('Sentry source-map uploads', () => {
    const keys = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'BUILD_VCS_NUMBER'];
    let previous;

    beforeEach(() => {
        previous = keys.map(key => process.env[key]);
        keys.forEach(key => { delete process.env[key]; });
        jest.resetModules();
    });

    afterEach(() => {
        keys.forEach((key, index) => {
            if (previous[index] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[index];
            }
        });
    });

    it('builds hidden maps without requiring upload credentials', () => {
        const config = require('../../../webpack.config.prod');
        expect(config.devtool).toBe('hidden-source-map');
        expect(config.plugins).toEqual([]);
    });

    it('fails explicitly when a token is supplied without complete upload configuration', () => {
        process.env.SENTRY_AUTH_TOKEN = 'test-token';
        expect(() => require('../../../webpack.config.prod')).toThrow('SENTRY_AUTH_TOKEN is set');
    });

    it('uses the build release and deletes maps after upload', () => {
        Object.assign(process.env, {
            SENTRY_AUTH_TOKEN: 'test-token',
            SENTRY_ORG: 'test-org',
            SENTRY_PROJECT: 'test-project',
            BUILD_VCS_NUMBER: 'test-release'
        });
        const config = require('../../../webpack.config.prod');
        const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');
        expect(config.plugins).toHaveLength(1);
        expect(sentryWebpackPlugin).toHaveBeenCalledWith({
            authToken: 'test-token',
            org: 'test-org',
            project: 'test-project',
            release: { name: 'test-release' },
            sourcemaps: { filesToDeleteAfterUpload: ['./public/dist/**/*.map'] },
            telemetry: false
        });
    });
});
