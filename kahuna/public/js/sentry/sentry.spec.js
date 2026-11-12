import angular from 'angular';
import * as Sentry from '@sentry/browser';
import './sentry';

jest.mock('angular', () => ({ default: jest.requireActual('angular') }));

jest.mock('@sentry/browser', () => ({
    init: jest.fn(),
    captureException: jest.fn(),
    captureConsoleIntegration: jest.fn(() => ({ name: 'CaptureConsole' })),
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
