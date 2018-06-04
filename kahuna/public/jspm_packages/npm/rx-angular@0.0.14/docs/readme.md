# rx.angular.js <sup>v0.0.3</sup>

Reactive Extensions (Rx) is a library for composing asynchronous and event-based programs using observable sequences and Array#extras style operators.

Data sequences can take many forms, such as a stream of data from a file or web service, web services requests, system notifications, or a series of events such as user input.

Reactive Extensions represents all these data sequences as observable sequences. An application can subscribe to these observable sequences to receive asynchronous notifications as new data arrive.

This library provides bridges to the popular [Angular JS](http://angularjs.org) library.

## Reactive Extensions Binding for the AngularJS API

This section contains the reference documentation for the Reactive Extensions for AngularJS library.

Factories:
- [`rx`](#rx)
- [`observeOnScope`](#observeonscopescope-watchexpression-objectequality)

Observable Methods:
- [`safeApply`](#safeapplyscope-fn)

[`$rootScope`](http://docs.angularjs.org/api/ng.$rootScope) Methods:
- [`$createObservableFunction`](#createobservablefunctionfunctionname-listener)
- [`$eventToObservable`](#eventtoobservableeventname)
- ['$toObservable'](#toobservablewatchexpression-objectequality)

* * *

### <a id="rx"></a>`rx`
<a href="#rx">#</a> [&#x24C8;](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/factory.js "View in source")

Creates a factory for using RxJS.

#### Returns
*(Rx)*: The root of RxJS.

#### Example
```js
angular.module('rxexamples', ['rx'])
  .controller('AppCtrl', function($scope, rx) {

    $scope.counter = 0;

    rx.Observable.interval(1000)
      .safeApply(
        $scope,
        function (x) { $scope.counter = x; })
      .subscribe();

  });
```

### Location

File:
- [`/src/factory.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/factory.js)

Dist:
- [`rx.angular.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/dist/rx.angular.js)

Prerequisites:
- [`rx.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.js) | [`rx.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.compat.js) | [`rx.lite.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.js) | [`rx.lite.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.compat.js)

NPM Packages:
- [`rx-angular`](https://www.npmjs.org/package/rx-angular)

Bower Packages:
- `angular-rx`

NuGet Packages:
- [`RxJS-Bridges-Angular`](http://www.nuget.org/packages/RxJS-Bridges-Angular)

Unit Tests:
- [`/tests/tests.factory.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/tests/factory.js)

* * *

### <a id="observeonscopescope-watchexpression-objectequality"></a>`observeOnScope(scope, watchExpression, [objectEquality])`
<a href="#observeonscopescope-watchexpression-objectequality">#</a> [&#x24C8;](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/observeronscope.js "View in source")

Creates a factory which allows the user to observe a property on a given scope to check for old and new values.

#### Arguments
1. `scope` *(Scope)*: The scope to apply the watch function.
2. `watchExpression`: Expression that is evaluated on each `$digest` cycle. A change in the return value triggers a call to the listener.
    - `string`: Evaluated as expression
    - `function(scope)`: called with current scope as a parameter.
3. `[objectEquality]`: *(Function)*: Compare object for equality rather than for reference.

#### Returns
*(Rx)*: The root of RxJS

#### Example
```js
angular.module('rxexamples', ['rx'])
  .controller('AppCtrl', function($scope, observeOnScope) {

    observeOnScope($scope, 'name').subscribe(function(change) {
      $scope.observedChange = change;
      $scope.newValue = change.newValue;
      $scope.oldValue = change.oldValue;
    });
  });
```

### Location

File:
- [`/src/observeronscope.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/observeronscope.js)

Dist:
- [`rx.angular.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/dist/rx.angular.js)

Prerequisites:
- [`rx.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.js) | [`rx.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.compat.js) | [`rx.lite.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.js) | [`rx.lite.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.compat.js)

NPM Packages:
- [`rx-angular`](https://www.npmjs.org/package/rx-angular)

Bower Packages:
- `angular-rx`

NuGet Packages:
- [`RxJS-Bridges-Angular`](http://www.nuget.org/packages/RxJS-Bridges-Angular)

Unit Tests:
- [`/tests/tests.observeronscope.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/tests/observeronscope.js)

* * *

### <a id="createobservablefunctionfunctionname-listener"></a>`$createObservableFunction(functionName, listener)`
<a href="#createobservablefunctionfunctionname-listener">#</a> [&#x24C8;](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/$rootScopeExtensions.js)

Creates an observable from a given function.

#### Arguments
1. `functionName`: *(String*): A function name to observe.
2. `listener`: *(Function)*: A listener function that gets executed.

#### Returns
*(Rx)*: A new Observable object with the watch expression in place.

#### Example
```js
angular.module('rxexamples', ['rx'])
  .controller('AppCtrl', function($scope) {

    $scope.$createObservableFunction('clickMe')
      .subscribe(function (name) {
        console.log(name);
      });

    $scope.$apply(function () {
      $scope.clickMe('RxJS');
    });

// => RxJS
```

### Location

File:
- [`/src/$rootScopeExtensions.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/$rootScopeExtensions.js)

Dist:
- [`rx.angular.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/dist/rx.angular.js)

Prerequisites:
- [`rx.lite.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.js) | [`rx.lite.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.compat.js)

NPM Packages:
- [`rx-angular`](https://www.npmjs.org/package/rx-angular)

Bower Packages:
- `angular-rx`

NuGet Packages:
- [`RxJS-Bridges-Angular`](http://www.nuget.org/packages/RxJS-Bridges-Angular)

Unit Tests:
- [`/tests/tests.$rootScopeExtensions.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/tests/$rootScopeExtensions.js)

* * *

### <a id="eventtoobservableeventname"></a>`$eventToObservable(eventName)`
<a href="#eventtoobservableeventname">#</a> [&#x24C8;](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/$rootScopeExtensions.js)

Creates an Observable from an event which is fired on the local $scope.
Expects an event name as the only input parameter.

#### Arguments
1. `eventName`: The event name to listen to.

#### Returns
*(Rx)*: A new Observable object with the watch for the event name.

#### Example
```js
angular.module('rxexamples', ['rx'])
  .controller('AppCtrl', function($scope) {

    $scope.$eventToObservable('nameChanged')
      .subscribe(function (data) {
        console.log('Event name %s', data.event.name);
        console.log('Additional arguments %s', data.additionalArguments);
      });

    $scope.$emit('nameChanged', 'foo', 'bar');

// => Event name nameChanged
// => Additional arguments foo, bar
```

### Location

File:
- [`/src/$rootScopeExtensions.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/$rootScopeExtensions.js)

Dist:
- [`rx.angular.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/dist/rx.angular.js)

Prerequisites:
- [`rx.lite.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.js) | [`rx.lite.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.compat.js)

NPM Packages:
- [`rx-angular`](https://www.npmjs.org/package/rx-angular)

Bower Packages:
- `angular-rx`

NuGet Packages:
- [`RxJS-Bridges-Angular`](http://www.nuget.org/packages/RxJS-Bridges-Angular)

Unit Tests:
- [`/tests/tests.$rootScopeExtensions.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/tests/$rootScopeExtensions.js)

* * *

### <a id="toobservablewatchexpression-objectequality"></a>`$toObservable(watchExpression, [objectEquality])`
<a href="#observeonscopescope-watchexpression-objectequality">#</a> [&#x24C8;](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/$rootScopeExtensions.js)

Creates an observable from a watch expression.

#### Arguments
1. `watchExpression`: Expression that is evaluated on each `$digest` cycle. A change in the return value triggers a call to the listener.
    - `string`: Evaluated as expression
    - `function(scope)`: called with current scope as a parameter.
2. `[objectEquality]`: *(Function)*: Compare object for equality rather than for reference.

#### Returns
*(Rx)*: A new Observable object with the watch expression in place.

#### Example
```js
angular.module('rxexamples', ['rx'])
  .controller('AppCtrl', function($scope) {

    $scope.$toObservable('name')
      .subscribe(function (name) {
        console.log(name);
      });

    $scope.$apply(function () {
      $scope.name = 'RxJS';
    });

// => RxJS
```

### Location

File:
- [`/src/$rootScopeExtensions.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/src/$rootScopeExtensions.js)

Dist:
- [`rx.angular.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/dist/rx.angular.js)

Prerequisites:
- [`rx.lite.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.js) | [`rx.lite.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.compat.js)

NPM Packages:
- [`rx-angular`](https://www.npmjs.org/package/rx-angular)

Bower Packages:
- `angular-rx`

NuGet Packages:
- [`RxJS-Bridges-Angular`](http://www.nuget.org/packages/RxJS-Bridges-Angular)

Unit Tests:
- [`/tests/tests.$rootScopeExtensions.js`](https://github.com/Reactive-Extensions/rx.angular.js/blob/master/tests/$rootScopeExtensions.js)

* * *
