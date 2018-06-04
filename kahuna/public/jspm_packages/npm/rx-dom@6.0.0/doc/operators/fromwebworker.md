### `Rx.DOM.fromWebWorker(url)`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/webworker.js "View in source") 

Creates a Web Worker with a given URL as a Subject.

#### Arguments
1. `url` *(`String`)*: The URL of the Web Worker.

#### Returns
*(`Subject`)*: A Subject which wraps a Web Worker.

#### Example
```js
var worker = Rx.DOM.fromWebWorker('worker.js');

worker.subscribe(function (e) {
  console.log(e.data);
});

worker.onNext('some data');
```

### Location

File:
- [`/src/webworker.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/webworker.js)

Dist:
- [`rx.dom.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/dist/rx.dom.js) | - [`rx.dom.compat.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/dist/rx.dom.compat.js)

Prerequisites:
- If using `rx.js`
  - [`rx.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.js) | [`rx.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.compat.js)
  - [`rx.binding.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.binding.js)
- [`rx.lite.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.js) | [`rx.lite.compat.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.compat.js)

NPM Packages:
- [`rx-dom`](https://preview.npmjs.com/package/rx-dom)

NuGet Packages:
- [`RxJS-Bridges-HTML`](http://www.nuget.org/packages/RxJS-Bridges-HTML/)

Unit Tests:
- [`/tests/tests.webworker.js](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.webworker.js)