const fs = require('fs');
const ini = require('ini');
const parseHocon = require('hocon-parser');

function load(app) {
    const propertiesFile = `/etc/gu/${app}.properties`;
    const configFile = `/etc/grid/${app}.conf`;
    if (fs.existsSync(configFile)) {
      return {
        type: "hocon",
        data: parseHocon(fs.readFileSync(configFile).toString())
      };
    }
    if (fs.existsSync(propertiesFile)) {
      return {
        type: "properties",
        data: ini.parse(fs.readFileSync(propertiesFile).toString())
      };
    }
    console.error(`Neither ${configFile} nor ${propertiesFile} exist`);
    return {};
}

function get(config, field) {
  if (config.type === "properties") {
    return config.data[field];
  } else if (config.type === "hocon") {
    const fieldElements = field.split(".")
    function getField(obj, fields) {
      if (fields.length === 0) return obj;
      getField(obj[fields[0]], fields.slice(1))
    }
    return getField(field.data, fieldElements);
  } else {
    console.error("Unknown config type")
    return undefined;
  }
}

module.exports = {
    load: load,
    get: get
};
