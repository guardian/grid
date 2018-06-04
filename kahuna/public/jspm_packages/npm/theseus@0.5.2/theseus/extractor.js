/* */ 
import {Resource} from './resource';
import {isArray, isObject, isDefined, isUndefined} from './util';

function contains(arr, item) {
  return arr.indexOf(item) !== -1;
}


var baseEntityProperties = ['uri', 'data', 'links', 'actions'];
var collectionEntityProperties = ['length', 'offset', 'total'];

function allowedEntityProperties(entityIsCollection) {
  if (entityIsCollection) {
    return baseEntityProperties.concat(collectionEntityProperties);
  } else {
    return baseEntityProperties;
  }
}

function isEntity(obj, isEmbedded) {
  // FIXME: avoid early returns
  if (! isObject(obj)) {
    return false;
  }

  var hasRequiredProps;
  if (isEmbedded) {
    hasRequiredProps = 'uri' in obj;
  } else {
    hasRequiredProps = 'data' in obj;
  }

  var keys = Object.keys(obj);

  // If data undefined, it may or may not be a collection
  var dataIsArray = isUndefined(obj.data) || isArray(obj.data);
  var entityProperties = allowedEntityProperties(dataIsArray);
  var hasOnlyEntityProps = keys.every(key => contains(entityProperties, key));

  return hasRequiredProps && hasOnlyEntityProps;
}

function parseResponse(response, isEmbedded, config) {
  if (isEmbedded) {
    if (response && isEntity(response, isEmbedded)) {
      // FIXME: don't mutate please
      if (isDefined(response.data)) {
        response.data = parseData(response.data, config);
      } else {
        // FIXME: hack to ensure Resource detects response as an
        // entity in its constructor
        response.data = undefined;
      }

      return new Resource(response.uri, config, response);
    } else {
      return parseData(response, config);
    }
  } else {
    if (response && isEntity(response, isEmbedded) && isDefined(response.data)) {
      response.data = parseData(response.data, config);
      // FIXME: don't mutate please
    }
    return response;
  }
}

function parseData(responseData, config) {
  var data;

  switch (typeof responseData) {
  case 'object':
    // Array
    if (isArray(responseData)) {
      // TODO: IE8-friendly map?
      data = responseData.map(function(item) {
        return parseResponse(item, true, config);
      });
      break;

    // Object
    } else if (isObject(responseData)) {
      data = {};
      for (var key in responseData) {
        data[key] = parseResponse(responseData[key], true, config);
      }
      break;

    // Other (null...)
    } else {
      // fall through
    }

  // else: plain value, no need to recurse
  case 'string':
  case 'number':
  case 'boolean':
  case 'undefined':
  default:
    data = responseData;
    break;
  }

  return data;
}


export function extractEntity(response, config) {
  return parseResponse(response, false, config);
}
