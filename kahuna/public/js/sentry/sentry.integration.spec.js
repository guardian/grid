import angular from 'angular';
import * as Sentry from '@sentry/browser';
import './sentry';

jest.mock('angular', () => ({ default: jest.requireActual('angular') }));

jest.mock('@sentry/browser', () => {
    const sdk = jest.requireActual('@sentry/browser');
    return {
        ...sdk,
        init: options => sdk.init({
            ...options,
            // Isolate console capture from unrelated browser integrations and never send events.
            defaultIntegrations: [],
            beforeSend: jest.fn(() => null)
        })
    };
});

describe('Sentry with Angular console logging', () => {
    let injector;
    let consoleError;
    let consoleWarn;
    let beforeSend;

    beforeAll(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    beforeEach(() => {
        consoleError.mockClear();
        consoleWarn.mockClear();
        window._clientConfig = {
            sessionId: 'kahuna-instance',
            sentry: {
                enabled: true,
                dsn: 'https://key@sentry.example.com/1',
                consoleCaptureLevels: ['warn', 'error']
            }
        };
        angular.module('sentryIntegrationConfig', [])
            .value('sentryDsn', 'https://key@sentry.example.com/1');
        injector = angular.injector(['ng', 'sentryIntegrationConfig', 'sentry']);
        beforeSend = Sentry.getClient().getOptions().beforeSend;
    });

    afterEach(async () => {
        await Sentry.close();
    });

    afterAll(() => {
        consoleError.mockRestore();
        consoleWarn.mockRestore();
    });

    it('logs HTTP failures without generating console or exception events', async () => {
        const handler = injector.get('$exceptionHandler');
        const httpError = { config: {}, data: {}, headers: {}, status: 500, statusText: 'error' };
        const anyHttpError = { uri: '/images', body: {}, status: 500, headers: {} };
        handler(httpError);
        handler(anyHttpError);
        handler(`Possibly unhandled rejection: ${JSON.stringify(httpError)}`);

        await Sentry.flush();
        expect(consoleError).toHaveBeenCalledTimes(3);
        expect(beforeSend).not.toHaveBeenCalled();
    });

    it('reports an Angular exception once while preserving its console output and cause', async () => {
        const error = new Error('controller failed');
        injector.get('$exceptionHandler')(error, 'controller');

        await Sentry.flush();
        expect(consoleError).toHaveBeenCalledWith(error, 'controller');
        expect(beforeSend).toHaveBeenCalledTimes(1);
        const event = beforeSend.mock.calls[0][0];
        expect(event.exception.values[0].value).toBe('controller failed');
        expect(event.extra.cause).toBe('controller');
        expect(event.logger).not.toBe('console');
    });

    it('still captures console warnings and errors outside Angular exception handling', async () => {
        injector.get('$exceptionHandler')(new Error('Angular exception'));
        await Sentry.flush();
        beforeSend.mockClear();

        console.warn('independent warning');
        console.error('independent error');

        await Sentry.flush();
        expect(beforeSend).toHaveBeenCalledTimes(2);
        expect(beforeSend.mock.calls.map(([event]) => [event.logger, event.message])).toEqual([
            ['console', 'independent warning'],
            ['console', 'independent error']
        ]);
    });
});
