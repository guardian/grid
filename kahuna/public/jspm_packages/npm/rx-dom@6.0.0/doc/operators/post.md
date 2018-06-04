### `Rx.DOM.post(url, [body])`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/ajax.js "View in source") 

Creates an observable sequence from an Ajax POST Request with the body.  This is just a shortcut to the [`Rx.DOM.ajax`](ajax.md) method with the POST method.

#### Arguments
1. `url` *(String)*: A string of the URL to make the Ajax call.
2. `[body]` *(Object)*: The body to post

#### Returns
*(Observable)*: The observable sequence which contains the response from the Ajax POST.

#### Example
```js
Rx.DOM.Request.post('/test', { text: 'sometext' })
  .subscribe(
    function (xhr) {
      console.log(xhr.responseText);
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
