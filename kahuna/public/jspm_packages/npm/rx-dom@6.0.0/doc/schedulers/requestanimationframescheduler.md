### `Rx.Scheduler.requestAnimationFrame`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/requestanimationframescheduler.js "View in source")

Gets an `Rx.Scheduler` that schedules schedules work on the `window.requestAnimationFrame` for immediate actions and defaults to `window.setTimeout` if not available.

#### Example
```js
var obs = Rx.Observable.return(
  42,
  Rx.Scheduler.requestAnimationFrame);

obs.subscribe(function (x) {
  // Scheduled using requestAnimationFrame
  console.log(x);
});

// => 42
```

### Location

File:
- [`/src/requestanimationframescheduler.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/requestanimationframescheduler.js)

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
- [`/tests/tests.requestanimationframescheduler.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.requestanimationframescheduler.js)
