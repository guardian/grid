#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
require('json5/lib/register');

const defaultConfig = require('./config.json5');
const dotenvConfig = require('dotenv').config({path: path.join(__dirname, '../../.env')}).parsed;

const ServiceConfig = require('./service-config');

const LOCALSTACK_ENDPOINT = 'http://localhost:4566';

AWS.config.update({
  credentials: new AWS.SharedIniFileCredentials({
    profile: dotenvConfig.AWS_PROFILE
  }),
  region: dotenvConfig.AWS_DEFAULT_REGION,
  endpoint: new AWS.Endpoint(LOCALSTACK_ENDPOINT)
});

const cloudformation = new AWS.CloudFormation();

function getCloudformationStackResources(stackName) {
  return cloudformation.describeStackResources({StackName: stackName}).promise();
}

async function doesStackExist(stackName) {
  const stacks = await cloudformation.listStacks({}).promise()
  const exists = stacks.StackSummaries.find(stack => stack.StackName === stackName);
  return !!exists;
}

function writeToDisk({path, content}) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, content, 'UTF8', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(content);
      }
    })
  });
}

(async () => {
  const coreStackCfnData = await getCloudformationStackResources(dotenvConfig.CORE_STACK_NAME);

  const coreStackProps = coreStackCfnData.StackResources.reduce((acc, item) => {
    return Object.assign({}, acc, {
      [item.LogicalResourceId]: item.PhysicalResourceId
    });
  }, {});

  const coreConfig = {...defaultConfig, ...dotenvConfig, coreStackProps}
  const coreServiceConfigs = ServiceConfig.getCoreConfigs(coreConfig);

  await Promise.all(
    Object.keys(coreServiceConfigs).map(filename => writeToDisk({
        path: `/etc/gu/${filename}.properties`,
        content: coreServiceConfigs[filename]
      })
    ));

  const authStackExists = await doesStackExist(dotenvConfig.AUTH_STACK_NAME)
  const localAuthFilePath = "/etc/gu/grid-prod.properties";

  if (authStackExists) {
    const authStackCfnData = await getCloudformationStackResources(dotenvConfig.AUTH_STACK_NAME);

    const authStackProps = authStackCfnData.StackResources.reduce((acc, item) => {
      return Object.assign({}, acc, {
        [item.LogicalResourceId]: item.PhysicalResourceId
      });
    }, {});

    const localAuthConfig = {...defaultConfig, ...dotenvConfig, authStackProps};

    await writeToDisk({
      path: localAuthFilePath,
      content: ServiceConfig.getUseLocalAuthConfig(localAuthConfig)
    })
  } else {
    if(fs.existsSync(localAuthFilePath)) {
      fs.unlinkSync(localAuthFilePath)
    }
  }
})();
