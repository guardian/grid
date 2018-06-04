/* */ 
import {Resource} from './resource';
import {defPropertyValue} from './util';
import {assertObjectParam, assertFunctionParam, assertStringParam} from './util/asserts';


export class Client {
  constructor(adapters) {
    assertObjectParam(adapters, 'adapters');
    // TODO: check instanceof http.adapter
    assertObjectParam(adapters.http, 'adapters.http');
    assertFunctionParam(adapters.promise, 'adapters.promise');

    defPropertyValue(this, 'resourceOptions', {
      http:    adapters.http,
      promise: adapters.promise
    });
  }

  resource(uri) {
    assertStringParam(uri, 'uri');

    // FIXME: swap argument order?
    return new Resource(uri, this.resourceOptions);
  }
};
