import {UserTelemetryEventSender, IUserTelemetryEvent} from '@guardian/user-telemetry-client';
import { v4 } from 'uuid';
import { structureQuery } from '../search/structured-query/syntax';

const getStoredId = (storage: Storage, key: string): string => {
    const maybeId = storage.getItem(key);
    if (maybeId) {
        return maybeId;
    } else {
        const id = v4();
        storage.setItem(key, id.toString());
        return id;
    }
};

const getBrowserId = () => getStoredId(localStorage, 'browserUuid');

const getSessionId = () => getStoredId(sessionStorage, 'sessionUuid');

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
        tags: {...tags, browserUuid: getBrowserId(), sessionUuid: getSessionId()}
    });
};

const sendFilterTelemetryEvent = (key: string, value: string, searchUuid: string) => {
    sendTelemetryEvent('GRID_FILTER', {
        type: 'filter',
        filterType: 'inclusion',
        key: key,
        value: value,
        searchUuid: searchUuid
    }, 1);
};

export const sendTelemetryForQuery = (query: string, nonFree?: boolean | string, uploadedByMe?: boolean ) => {
    const structuredQuery = structureQuery(query);
    const searchUuid = v4();
    // nonFree is unfortunately either a boolean, stringified boolean, or undefined
    const freeToUseOnly = (!(nonFree === 'true' || nonFree === true));
    const uploadedByMeOnly = (uploadedByMe);

    // Only log for true - matching how these filters work in Grid (only applied when true)
    if (freeToUseOnly) {
        sendFilterTelemetryEvent('freeToUseOnly', 'true', searchUuid);
    }
    if (uploadedByMeOnly) {
        sendFilterTelemetryEvent('uploadedByMeOnly', 'true', searchUuid);
    }

    structuredQuery.forEach(queryComponent => {
        // e.g. filter or search:
        // search > {type: 'text', value: 'my search'}
        // filter > {type: 'filter', filterType: 'inclusion', key: 'is', value: 'cool'}
        const { type } = queryComponent;
        const formattedType = (type: string) => {
            if (type === 'text') { return 'GRID_SEARCH'; }
            if (type === 'filter') { return 'GRID_FILTER'; }
            return `GRID_${type.toUpperCase()}`;
        };

        // In case search is empty, as with a search containing only filters
        sendTelemetryEvent(formattedType(type), {
            ...queryComponent,
            searchUuid: searchUuid
        }, 1);
    });
};
