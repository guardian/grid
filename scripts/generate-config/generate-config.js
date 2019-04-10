#!/usr/bin/env node

const fs = require('fs');
const AWS = require('aws-sdk');
const os = require('os');

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

function ensureDirectory(dir) {
  return new Promise((resolve, reject) => {
    // mkdir is deprecated in node, they recommend to use `stat` trapping errors instead
    fs.stat(dir, (err, stats) => {
      if(err) {
        fs.mkdir(dir, err => {
          if(err) {
            reject(err);
          } else {
            resolve();
          }
        })
      } else {
        // already exists
        resolve();
      }
    });
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

    const configDir = `${os.homedir()}/.grid`;
    await ensureDirectory(configDir);

    await Promise.all(
        Object.keys(serviceConfigs).map(filename => writeToDisk({
            path: `${configDir}/${filename}.conf`,
            content: serviceConfigs[filename]
        })
    ));
})();
