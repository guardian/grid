const fs = require('fs');
const parseHocon = require('hocon-parser');
const AWS = require('aws-sdk');

function load(app) {
    const homeConfigFile = process.env.HOME + `/.grid/${app}.conf`;
    const rootConfigFile = `/etc/grid/${app}.conf`;
    if (fs.existsSync(homeConfigFile)) {
      return {
        type: 'hocon',
        data: parseHocon(fs.readFileSync(homeConfigFile).toString())
      };
    }
    if (fs.existsSync(rootConfigFile)) {
      return {
        type: "hocon",
        data: parseHocon(fs.readFileSync(rootConfigFile).toString())
      };
    }
    console.error(`Neither ${homeConfigFile} nor ${rootConfigFile} exist`);
    return {};
}

function get(config, field) {
  if (config.type === "hocon") {
    const fieldElements = field.split(".")
    function getField(obj, fields) {
      if (fields.length === 0) return obj;
      return getField(obj[fields[0]], fields.slice(1))
    }
    return getField(config.data, fieldElements);
  } else {
    console.error("Unknown config type")
    return undefined;
  }
}

function s3Client(region) {
  return new AWS.S3({region, endpoint: 'https://localstack.media.local.dev-gutools.co.uk', s3ForcePathStyle: true, accessKeyId: 'test', secretAccessKey: 'test'});
};

module.exports = {
    load: load,
    get: get,
    s3Client,
};
