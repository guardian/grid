### `Rx.DOM.fromWebSocket(url, protocol, [observerOrOnNext])`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/websocket.js "View in source")

Creates a WebSocket Subject with a given URL, protocol and an optional observer for the open event.

#### Arguments
1. `url` *(String)*: The URL of the WebSocket.
2. `protocol` *(String)*: The protocol of the WebSocket.
3. `openObserver` *(`Rx.Observer`)*: An optional Observer to capture the open event.
4. `closingObserver` *(`Rx.Observer`)*: An optional Observer capture the the moment before the underlying socket is closed.

#### Returns
*(`Subject`)*: A Subject which wraps a WebSocket.

#### Example
```js
// an observer for when the socket is open
var openObserver = Observer.create(function(e) {
  console.info('socket open');

  // Now it is safe to send a message
  socket.onNext('test');
});

// an observer for when the socket is about to close
var closingObserver = Observer.create(function() {
  console.log('socket is about to close');
});

// create a web socket subject
socket = Rx.DOM.fromWebSocket(
  'ws://echo.websockets.org',
  null, // no protocol
  openObserver,
  closingObserver);

// subscribing creates the underlying socket and will emit a stream of incoming
// message events
socket.subscribe(
  function(e) {
    console.log('message: ', e.data);
  },
  function(e) {
    // errors and "unclean" closes land here
    console.error('error: ', e);
  },
  function() {
    // the socket has been closed
    console.info('socket closed');
  }
);
```

### Location

File:
- [`/src/websocket.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/websocket.js)

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
- [`/tests/tests.websocket.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.fromwebsocket.js)
