#!/usr/bin/env node

const fs = require('fs');
const AWS = require('aws-sdk');
require('json5/lib/require');
const defaultConfig = require('./config.json5');
const ServiceConfig = require('./service-config');

function getCloudformationStackOutput() {
    AWS.config.update({
        credentials: new AWS.SharedIniFileCredentials({
            profile: defaultConfig.aws.profile
        }),
        region: defaultConfig.aws.region
    });

    const cloudformation = new AWS.CloudFormation();

    return cloudformation.describeStacks({StackName: defaultConfig.aws.stackName}).promise();
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
    const cfnData = await getCloudformationStackOutput();
    const stackOutputs = cfnData.Stacks[0].Outputs;

    const stackProps = stackOutputs.reduce((acc, item) => {
        return Object.assign({}, acc, {
            [item.OutputKey]: item.OutputValue
        });
    }, {});

    const config = Object.assign({}, defaultConfig, {stackProps});
    const serviceConfigs = ServiceConfig.getConfigs(config);

    await Promise.all(
        Object.keys(serviceConfigs).map(filename => writeToDisk({
            path: `/etc/gu/${filename}.properties`,
            content: serviceConfigs[filename]
        })
    ));
})();
