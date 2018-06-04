`Rx.DOM.ajax(url | settings)`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/ajax.js "View in source")

Creates an observable for an Ajax request with either a settings object with url, headers, etc or a string for a URL.

#### Arguments
- `url` *(String)*: A string of the URL to make the Ajax call.
- `settings` *(Object)*: An object with the following properties

    - `async` *(Boolean)*: Whether the request is async. The default is `true`.
    - `body` *(Object)*: Optional body
    - `contentType` *(String)*: The Content-Type for the request. Default is 'application/x-www-form-urlencoded; charset=UTF-8'.
    - `crossDomain` *(Boolean)*: true if to use CORS, else false. The default is `false`.
    - `headers` *(Object)*: Optional headers
    - `method` *(String)*: Method of the request, such as GET, POST, PUT, PATCH, DELETE. The default is GET.
    - `password` *(String)*: The password for the request.
    - `progressObserver` *(Observer)*: An optional `Observer` which listen to XHR2 progress events.
    - `responseType` *(String)*: The response type. Either can be 'json' or 'text'. The default is 'text'
    - `url` *(String)*: URL of the request
    - `user` *(String)*: The user for the request.

#### Returns
*(Observable)*: An Observable sequence with the following data.

For a successful operation, the result will contains the following:
- `response` - *(Object)*: The response from the XmlHTTPRequest. Parsed into JSON if the `responseType` set.
- `status` - *(Number)*: The HTTP status code.
- `responseType` - *(String)*: The HTTP Response type.
- `xhr` - *(XmlHTTPRequest)*: The XmlHTTPRequest from the request.
- `originalEvent` - *(Object)*: The original event from the callback handler.

For a failed operation, the result will contain the following:
- `type` - *(String)*: The type of rejection. This will be either 'error' or 'abort'.
- `status` - *(Number)*: The HTTP status code.
- `xhr` - *(XmlHTTPRequest)*: The XmlHTTPRequest from the request.
- `originalEvent` - *(Object)*: The original event from the callback handler.

#### Example

The following example uses a simple URL to retrieve a list of products.
```js
Rx.DOM.ajax({ url: '/products', responseType: 'json'})
  .subscribe(
    function (data) {
      data.response.forEach(function (product) {
        console.log(product);
      });
    },
    function (error) {
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
- [`/tests/tests.ajax.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.ajax.js)
