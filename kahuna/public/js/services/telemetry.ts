import {UserTelemetryEventSender, IUserTelemetryEvent} from '@guardian/user-telemetry-client';

declare global {
    interface Window {
        _clientConfig: {
            telemetryUri: string | undefined
        }
    }
}

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
        tags
    });
};
