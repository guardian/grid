import AWS from 'aws-sdk';

import config from './config';

function buildCredentials(): AWS.Credentials {
    if(config.stage == 'DEV') {
        return new AWS.SharedIniFileCredentials({ profile: config.awsProfile });
    }

    return new AWS.EnvironmentCredentials("AWS");
}

const credentials = buildCredentials();

export const s3 = new AWS.S3({ credentials, region: config.awsRegion });
export const cloudwatch = new AWS.CloudWatch({ credentials, region: config.awsRegion });