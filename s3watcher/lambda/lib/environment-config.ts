class EnvironmentConfig {
    static get stack() {
        return process.env.STACK || 'media-service';
    }

    static get stage() {
        return process.env.STAGE || 'DEV';
    }

    static get app() {
        return process.env.APP || 's3-watcher';
    }

    static get isDev() {
        return this.stage === 'DEV';
    }

    static get region() {
        return process.env.REGION || 'eu-west-1';
    }

    static get profile() {
        return process.env.PROFILE || 'media-service';
    }

    static get loggingRoleArn() {
        return process.env.LOGGING_ROLE;
    }

    static get loggingStream() {
        return process.env.STREAM_NAME;
    }
}

module.exports = EnvironmentConfig;
