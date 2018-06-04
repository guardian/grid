/* */ 
export function isArray(obj) {
  return obj instanceof Array;
}

export function isObject(obj) {
  return obj instanceof Object;
}

export function isString(value) {
  return typeof value === 'string';
}

export function isDefined(value) {
  return typeof value !== 'undefined';
}

export function isUndefined(value) {
  return ! isDefined(value);
}


export function memoize(func) {
  var value;
  var hasValue = false;
  return function(...args) {
    if (! hasValue) {
      value = func(...args);
      hasValue = true;
    }
    return value;
  };
}


export function defPropertyValue(obj, propName, value) {
  Object.defineProperty(obj, propName, {
    value: value
  });
}

export function defPropertyGetter(obj, propName, getter) {
  Object.defineProperty(obj, propName, {
    get: getter
  });
}

export function defPropertyLazyValue(obj, propName, computeVal) {
  defPropertyGetter(obj, propName, memoize(computeVal));
}
