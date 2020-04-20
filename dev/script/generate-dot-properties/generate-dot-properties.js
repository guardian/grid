#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
require('json5/lib/register');

const defaultConfig = require('./config.json5');
const dotenvConfig = require('dotenv').config({ path: path.join(__dirname, '../../.env') }).parsed;

const ServiceConfig = require('./service-config');

const LOCALSTACK_ENDPOINT=`https://localstack.media.${dotenvConfig.DOMAIN}`

function getCloudformationStackResources() {
    AWS.config.update({
        credentials: new AWS.SharedIniFileCredentials({
            profile: dotenvConfig.AWS_PROFILE
        }),
        region: dotenvConfig.AWS_DEFAULT_REGION,
        endpoint: new AWS.Endpoint(LOCALSTACK_ENDPOINT)
    });

    const cloudformation = new AWS.CloudFormation();

    return cloudformation.describeStackResources({StackName: dotenvConfig.CORE_STACK_NAME}).promise();
}

function writeToDisk({path, content}) {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, content, 'UTF8', (err) => {
            if (err){
                reject(err);
            } else {
                resolve(content);
            }
        })
    });
}

(async () => {
    const cfnData = await getCloudformationStackResources();
    const stackResources = cfnData.StackResources;

    const stackProps = stackResources.reduce((acc, item) => {
        return Object.assign({}, acc, {
            [item.LogicalResourceId]: item.PhysicalResourceId
        });
    }, {});

    const config = {...defaultConfig, ...dotenvConfig, stackProps, LOCALSTACK_ENDPOINT}
    const serviceConfigs = ServiceConfig.getConfigs(config);

    await Promise.all(
        Object.keys(serviceConfigs).map(filename => writeToDisk({
            path: `/etc/gu/${filename}.properties`,
            content: serviceConfigs[filename]
        })
    ));
})();
