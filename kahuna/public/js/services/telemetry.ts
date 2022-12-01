import {UserTelemetryEventSender, IUserTelemetryEvent} from '@guardian/user-telemetry-client';

declare global {
    interface Window {
        _clientConfig: {
            telemetryUri: string | undefined
        }
    }
}

export const generateId = () => (Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

const getStoredId = (storage: Storage, key: string) => {
    const maybeId = storage.getItem(key);
    if (maybeId) {
        return Number(maybeId);
    } else {
        const id = generateId();
        storage.setItem(key, id.toString());
        return id;
    }
};

const getBrowserId = () => getStoredId(localStorage, 'browserId');

const getSessionId = () => getStoredId(localStorage, 'sessionId');

const getEnv = () => {
    const url = window.location.hostname;
    if (url.includes("local.dev-gutools.co.uk")) {return "LOCAL";}
    if (url.includes("test.dev-gutools.co.uk")) {return "TEST";}
    if (url.includes(".gutools.co.uk")) {return "PROD";}
};

const telemetryUri = window._clientConfig.telemetryUri;

export const telemetrySender = telemetryUri ? new UserTelemetryEventSender(telemetryUri) : undefined;

export const sendTelemetryEvent = (type: string, tags?: IUserTelemetryEvent["tags"], value: boolean | number = true): void => {
    telemetrySender?.addEvent({
        app: "grid",
        stage: getEnv(),
        eventTime: new Date().toISOString(),
        type,
        value,
        tags: {...tags, browserId: getBrowserId(), sessionId: getSessionId()}
    });
};
