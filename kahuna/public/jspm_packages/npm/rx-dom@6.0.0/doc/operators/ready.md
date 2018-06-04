### `Rx.DOM.ready()`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/ready.js "View in source") 

Creates an Observable sequence which fires when the DOM is fully loaded.

While JavaScript provides the `load` event for executing code when a page is rendered, this event does not get triggered until all assets such as images have been completely received. In most cases, the script can be run as soon as the DOM hierarchy has been fully constructed. The handler passed to `.ready()` is guaranteed to be executed after the DOM is ready, so this is usually the best place to attach all other event handlers and run other jQuery code. When using scripts that rely on the value of CSS style properties, it's important to reference external stylesheets or embed style elements before referencing the scripts.

In cases where code relies on loaded assets (for example, if the dimensions of an image are required), the code should be placed in a handler for the `load` event instead.

#### Returns
*(`Observable`)*: An observable sequence which fires when the DOM is fully loaded.

#### Example

```js
function initialize() {
    // Do something on initialization
}

Rx.DOM.ready().subscribe(initialize);
```

### Location

File:
- [`/src/ready.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/ready.js)
- [`/src/ready.compat.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/ready.compat.js)

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
- [`/tests/ready.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/ready.js)
