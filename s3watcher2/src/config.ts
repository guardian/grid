export interface Config {
    stack: string,
    stage: string,
    app: string,

    loggingRoleArn?: string,
    loggingStream?: string,

    awsProfile: string,
    awsRegion: string,

    apiKey: string,
    importUrl: string,
    failBucket: string
}

function readConfig(): Config {
    const apiKey = process.env.API_KEY;
    if(!apiKey) {
        throw new Error("Missing API_KEY");
    }

    const importUrl = process.env.IMPORT_URL;
    if(!importUrl) {
        throw new Error("Missing IMPORT URL");
    }

    const failBucket = process.env.FAIL_BUCKET;
    if(!failBucket) {
        throw new Error("Missing FAIL_BUCKET URL");
    }

    return {
        stack: process.env.STACK || 'media-service',
        stage: process.env.STAGE || 'DEV',
        app: process.env.APP || 's3-watcher',

        loggingRoleArn: process.env.LOGGING_ROLE,
        loggingStream: process.env.STREAM_NAME,

        awsProfile: process.env.AWS_PROFILE || 'media-service',
        awsRegion: process.env.REGION || 'eu-west-1',

        apiKey, importUrl, failBucket
    };
}

const config = readConfig();
export default config