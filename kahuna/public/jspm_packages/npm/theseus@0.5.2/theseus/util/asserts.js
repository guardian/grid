/* */ 

export class MissingParameterError extends Error {
  constructor(name) {
    // FIXME: so we have to call super, but it doesn't work to pass in
    // the message argument?
    const message = `Missing expected parameter ${name}`;
    super(message);
    this.message = message;
    this.name = this.constructor.name;
  }
};

export class ParameterTypeError extends Error {
  constructor(name, type) {
    // FIXME: so we have to call super, but it doesn't work to pass in
    // the message argument?
    const message = `Parameter ${name} expected to be of type ${type}`;
    super(message);
    this.message = message;
    // FIXME: name, type?
    this.name = this.constructor.name;
  }
};

export function assertParamType(value, name, type) {
  var actualType = typeof value;
  if (actualType !== type) {
    if (actualType === 'undefined') {
      throw new MissingParameterError(name);
    } else {
      throw new ParameterTypeError(name, type);
    }
  }
};

export function assertObjectParam(value, name) {
  assertParamType(value, name, 'object');
  // TODO: assert not null
};

export function assertFunctionParam(value, name) {
  assertParamType(value, name, 'function');
};

export function assertStringParam(value, name) {
  assertParamType(value, name, 'string');
};

export function assertPromiseParam(value, name) {
  // FIXME: will yield misleading error
  assertParamType(value, name, 'object');
  if (typeof value.then !== 'function' || typeof value.catch !== 'function') {
    throw new ParameterTypeError(name, 'Promise');
  }
};
