### `Rx.DOM.Request.getJSON(url)`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/ajax.js "View in source") 

Creates an observable sequence from JSON from an Ajax request.  This is just a shortcut to the [`Rx.DOM.ajax`](ajax.md) method with the GET method and parsing the `responseText` as JSON.

#### Arguments
1. `url` *(String)*: A string of the URL to make the Ajax call.

#### Returns
*(Observable)*: The observable sequence which contains the parsed JSON.

#### Example
```js
Rx.Request.getJSON('/products')
  .subscribe(
    function (data) {
      // Log data length
      console.log(data.length);
    },
    function (err) {
      // Log the error
    }
  );
```

### Location

File:
- [`/src/ajax.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/ajax.js)

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
- [`/tests/tests.ajax.js](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.ajax.js)
