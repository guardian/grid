### `Rx.DOM.Request.jsonpRequest(url | settings)`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/jsonp.js "View in source")

Creates an observable JSONP Request with the specified settings or a string URL.  **Note when using the method with a URL, it must contain JSONPRequest=?.**

This method has two versions, one with a string URL, the other with a settings object.

```js
// With a string URL
Rx.DOM.Request.jsonpRequest(url);

// With a settings object
Rx.DOM.Request.jsonpRequest(settings);
```

#### Arguments
- `url` *(String)*: A string of the URL to make the JSONP call.

- `settings` *(Object)*: An object with the following properties:
    - `async` *(Boolean)*: Whether the request is async. The default is `true`.
    - `jsonp` *(String)*: The named callback parameter for the JSONP call
    - `jsonpCallback` *(String)*: Name of the function in the root object that JSONP will call. This is useful for when the JSONP callback is hardcoded and can't be changed
    - `url` *(String)*: URL of the request

#### Returns
*(Observable)*: An Observable sequence with the following data.

For a successful operation, the result will contains the following:
- `response` - *(Object)*: The response from the XmlHTTPRequest. Parsed into JSON if the `responseType` set.
- `status` - *(Number)*: The HTTP status code.
- `responseType` - *(String)*: The HTTP Response type which will be 'jsonp'
- `originalEvent` - *(Object)*: The original event from the callback handler.

For a failed operation, the result will contain the following:
- `type` - *(String)*: The type of rejection. This will be 'error'.
- `status` - *(Number)*: The HTTP status code.
- `originalEvent` - *(Object)*: The original event from the callback handler.

#### Example

The following example uses a simple URL to retrieve a list of entries from Wikipedia.

```js
var url = 'http://en.wikipedia.org/w/api.php?action=opensearch'
  + '&format=json'
  + '&search=reactive'
  + '&JSOPRequest=?';

Rx.DOM.jsonpRequest(url)
  .subscribe(
    function (data) {
      data.response[1].forEach(function (item) {
        console.log(item);
      });
    },
    function (error) {
      // Log the error
    }
  );
```

### Location

File:
- [`/src/jsonp.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/jsonp.js)

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
- [`/tests/tests.jsonp.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.jsonp.js)
