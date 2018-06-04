# RxJS-DOM <sup>v6.0</sup>

Reactive Extensions (Rx) is a library for composing asynchronous and event-based programs using observable sequences and LINQ-style query operators.  Data sequences can take many forms, such as a stream of data from a file or web service, web services requests, system notifications, or a series of events such as user input.  Reactive Extensions represents all these data sequences as observable sequences. An application can subscribe to these observable sequences to receive asynchronous notifications as new data arrive. This library provides bridges to common DOM related features such as events, Ajax requests, JSONP requests, and HTML5 features like WebSockets, Web Workers, Geolocation, MutationObservers and more.

## Reactive Extensions Binding for the DOM (RxJS-DOM) API

This section contains the reference documentation for the Reactive Extensions for the DOM class library.

### Events

- [`Rx.DOM.fromEvent`](operators/fromevent.md)
- [`Rx.DOM.ready`](operators/ready.md)

### Event Shortcuts

- [`Rx.DOM.blur`](operators/blur.md)
- [`Rx.DOM.change`](operators/change.md)
- [`Rx.DOM.click`](operators/click.md)
- [`Rx.DOM.contextmenu`](operators/contextmenu.md)
- [`Rx.DOM.dblclick`](operators/dblclick.md)
- [`Rx.DOM.error`](operators/error.md)
- [`Rx.DOM.focus`](operators/focus.md)
- [`Rx.DOM.focusin`](operators/focusin.md)
- [`Rx.DOM.focusout`](operators/focusout.md)
- [`Rx.DOM.keydown`](operators/keydown.md)
- [`Rx.DOM.keypress`](operators/keypress.md)
- [`Rx.DOM.keyup`](operators/keyup.md)
- [`Rx.DOM.load`](operators/load.md)
- [`Rx.DOM.mousedown`](operators/mousedown.md)
- [`Rx.DOM.mouseenter`](operators/mouseenter.md)
- [`Rx.DOM.mouseleave`](operators/mouseleave.md)
- [`Rx.DOM.mousemove`](operators/mousemove.md)
- [`Rx.DOM.mouseout`](operators/mouseout.md)
- [`Rx.DOM.mouseover`](operators/mouseover.md)
- [`Rx.DOM.mouseup`](operators/mouseup.md)
- [`Rx.DOM.resize`](operators/resize.md)
- [`Rx.DOM.scroll`](operators/scroll.md)
- [`Rx.DOM.select`](operators/select.md)
- [`Rx.DOM.submit`](operators/submit.md)
- [`Rx.DOM.unload`](operators/unload.md)

### Pointer Events (If supported by your browser)

- [`Rx.DOM.pointerdown`](operators/pointerdown.md)
- [`Rx.DOM.pointerenter`](operators/pointerenter.md)
- [`Rx.DOM.pointerleave`](operators/pointerleave.md)
- [`Rx.DOM.pointermove`](operators/pointermove.md)
- [`Rx.DOM.pointerout`](operators/pointerout.md)
- [`Rx.DOM.pointerover`](operators/pointerover.md)
- [`Rx.DOM.pointerup`](operators/pointerup.md)

### Touch Events (If supported by your browser)

- [`Rx.DOM.touchcancel`](operators/touchcancel.md)
- [`Rx.DOM.touchend`](operators/touchend.md)
- [`Rx.DOM.touchmove`](operators/touchmove.md)
- [`Rx.DOM.touchstart`](operators/touchstart.md)

### Ajax

- [`Rx.DOM.ajax`](operators/ajax.md)
- [`Rx.DOM.get`](operators/get.md)
- [`Rx.DOM.getJSON`](operators/getjson.md)
- [`Rx.DOM.post`](operators/post.md)
- [`Rx.DOM.jsonpRequest`](operators/jsonprequest.md)

Server-Sent Events
- [`Rx.DOM.fromEventSource`](operators/fromeventsource.md)

Web Sockets

- [`Rx.DOM.fromWebSocket`](operators/fromwebsocket.md)

Web Workers

- [`Rx.DOM.fromWebWorker`](operators/fromwebworker.md)

Mutation Observers

- [`Rx.DOM.fromMutationObserver`](operators/frommutationobserver.md)

Geolocation

- [`Rx.DOM.geolocation.getCurrentPosition`](operators/getcurrentposition.md)
- [`Rx.DOM.geolocation.watchPosition`](operators/watchposition.md)

Schedulers

- [`Rx.Scheduler.requestAnimationFrame`](schedulers/requestanimationframe.md)
- [`Rx.Scheduler.microtask`](schedulers/microtaskscheduler.md)

[`FileReader`](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)

- [`Rx.DOM.fromReader`](operators/fromreader.md)
