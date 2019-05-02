import config from './config';

import ELKKinesisLogger from '@guardian/elk-kinesis-logger';

export interface Logger {
    log(message: string, extraDetail?: { [key: string]: string }): Logger
    error(message: string, extraDetail?: { [key: string]: string }): Logger
    close(): Promise<void>
}

class ConsoleLogger implements Logger {
    log(message: string, extraDetail?: { [key: string]: string; } | undefined): Logger {
        console.log(message, JSON.stringify(extraDetail));
        return this;
    }
    
    error(message: string, extraDetail?: { [key: string]: string; } | undefined): Logger {
        console.error(message, JSON.stringify(extraDetail));
        return this;
    }
    
    close(): Promise<void> {
        return Promise.resolve();
    }
}

function buildLogger() {
    const { stack, app ,stage } = config;
    
    if(config.loggingRoleArn && config.loggingStream) {
        return new ELKKinesisLogger({
            stack, stage, app,
            streamName: config.loggingStream
        }).withRole(config.loggingRoleArn).open();
    } else {
        return new ConsoleLogger();
    }
}

export const logger = buildLogger();