import angular from 'angular';
import * as Sentry from '@sentry/browser';
import './sentry';

jest.mock('angular', () => ({ default: jest.requireActual('angular') }));

jest.mock('@sentry/browser', () => ({
    init: jest.fn(),
    captureException: jest.fn(),
    captureConsoleIntegration: jest.fn(() => ({ name: 'CaptureConsole' })),
    browserTracingIntegration: jest.fn(() => ({ name: 'BrowserTracing' })),
    replayIntegration: jest.fn(() => ({ name: 'Replay' })),
    setUser: jest.fn(),
    withScope: callback => callback({ addEventProcessor: jest.fn() }),
    setContext: jest.fn()
}));

describe('Sentry browser reporting', () => {
    let delegate;

    function start(dsn, overrides = {}) {
        window._clientConfig.sentry = {
            enabled: Boolean(dsn),
            dsn,
            environment: 'TEST',
            release: 'test-release',
            consoleCaptureLevels: ['error'],
            tracesSampleRate: 0,
            replayOnErrorSampleRate: 0,
            ...overrides
        };
        angular.module('sentryTestConfig', [])
            .value('$exceptionHandler', delegate);
        return angular.injector(['ng', 'sentryTestConfig', 'sentry']);
    }

    beforeEach(() => {
        jest.clearAllMocks();
        delegate = jest.fn();
        window._clientConfig = { sessionId: 'kahuna-instance' };
    });

    it('does not initialise without a DSN', () => {
        start(undefined);
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('initialises console capture and attaches the serving instance', () => {
        start('https://key@sentry.example.com/1');
        expect(Sentry.captureConsoleIntegration).toHaveBeenCalledWith({ levels: ['error'] });
        expect(Sentry.init).toHaveBeenCalledWith({
            dsn: 'https://key@sentry.example.com/1',
            environment: 'TEST',
            release: 'test-release',
            tracesSampleRate: 0,
            tracePropagationTargets: [],
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            integrations: [{ name: 'CaptureConsole' }]
        });
        expect(Sentry.setContext).toHaveBeenCalledWith('grid', { instanceId: 'kahuna-instance' });
    });

    it('does not initialise when explicitly disabled even with a DSN', () => {
        start('https://key@sentry.example.com/1', { enabled: false });
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('omits console capture when no levels are configured', () => {
        start('https://key@sentry.example.com/1', { consoleCaptureLevels: [] });
        expect(Sentry.captureConsoleIntegration).not.toHaveBeenCalled();
        expect(Sentry.init.mock.calls[0][0].integrations).toEqual([]);
    });

    it('sends no user identity when none is supplied by the server', () => {
        start('https://key@sentry.example.com/1');
        expect(Sentry.setUser).not.toHaveBeenCalled();
    });

    it('does not install tracing when the sample rate is zero', () => {
        start('https://key@sentry.example.com/1');
        expect(Sentry.browserTracingIntegration).not.toHaveBeenCalled();
    });

    it('installs tracing with the configured rate and propagation targets', () => {
        const tracePropagationTargets = ['https://api.example.com'];
        start('https://key@sentry.example.com/1', { tracesSampleRate: 0.25, tracePropagationTargets });
        expect(Sentry.browserTracingIntegration).toHaveBeenCalledTimes(1);
        expect(Sentry.init.mock.calls[0][0]).toMatchObject({
            tracesSampleRate: 0.25,
            tracePropagationTargets,
            integrations: [{ name: 'CaptureConsole' }, { name: 'BrowserTracing' }]
        });
    });

    it('does not install replay by default and never enables continuous recording', () => {
        start('https://key@sentry.example.com/1');
        expect(Sentry.replayIntegration).not.toHaveBeenCalled();
        expect(Sentry.init.mock.calls[0][0].replaysSessionSampleRate).toBe(0);
    });

    it('installs error-triggered replay only with mandatory masking and media blocking', () => {
        start('https://key@sentry.example.com/1', { replayOnErrorSampleRate: 0.1 });
        expect(Sentry.replayIntegration).toHaveBeenCalledWith({
            maskAllText: true,
            blockAllMedia: true
        });
        expect(Sentry.init.mock.calls[0][0]).toMatchObject({
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0.1,
            integrations: [{ name: 'CaptureConsole' }, { name: 'Replay' }]
        });
    });

    it('attaches only the server-supplied anonymous identifier', () => {
        start('https://key@sentry.example.com/1', { userId: 'salted-id' });
        expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'salted-id' });
    });

    it('attaches email only when supplied by the server', () => {
        start('https://key@sentry.example.com/1', { userEmail: 'someone@example.com' });
        expect(Sentry.setUser).toHaveBeenCalledWith({ email: 'someone@example.com' });
    });

    it('preserves Angular exception handling and reports the cause as extra context', () => {
        const handler = start('https://key@sentry.example.com/1').get('$exceptionHandler');
        const error = new Error('test');
        handler(error, 'controller');
        expect(delegate).toHaveBeenCalledWith(error, 'controller');
        expect(Sentry.captureException).toHaveBeenCalledWith(error, {
            captureContext: { extra: { cause: 'controller' } }
        });
    });

    it('does not report failed HTTP requests or their unhandled rejection messages', () => {
        const handler = start('https://key@sentry.example.com/1').get('$exceptionHandler');
        const httpError = { config: {}, data: {}, headers: {}, status: 500, statusText: 'error' };
        const anyHttpError = { uri: '/images', body: {}, status: 500, headers: {} };
        handler(httpError);
        handler(anyHttpError);
        handler(`Possibly unhandled rejection: ${JSON.stringify(httpError)}`);
        expect(delegate).toHaveBeenCalledTimes(3);
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('still delegates to Angular if exception capture throws', () => {
        const handler = start('https://key@sentry.example.com/1').get('$exceptionHandler');
        const error = new Error('test');
        const captureFailure = new Error('capture failed');
        Sentry.captureException.mockImplementationOnce(() => { throw captureFailure; });

        expect(() => handler(error, 'controller')).toThrow(captureFailure);
        expect(delegate).toHaveBeenCalledWith(error, 'controller');
    });
});
