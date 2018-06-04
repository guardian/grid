### `Rx.DOM.fromEvent(element, eventName, [selector], [useCapture])`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/fromevent.js "View in source")

Creates an observable sequence by adding an event listener to the matching DOMElement or DOMNodeList.

#### Arguments
1. `element` *(`Any`)*: The DOMElement, DOMNodeList to attach a listener.
2. `eventName` *(`String`)*: The event name to attach the observable sequence.
3. `[selector]` *(`Function`)*: A selector which takes the arguments from the event handler to produce a single item to yield on next.
4. `[useCapture]` *(`Boolean`)*: If `true`, `useCapture` indicates that the user wishes to initiate capture. After initiating capture, all events of the specified type will be dispatched to the registered listener before being dispatched to any `EventTarget` beneath it in the DOM tree. Events which are bubbling upward through the tree will not trigger a listener designated to use capture.

#### Returns
*(`Observable`)*: An observable sequence of events from the specified element and the specified event.

#### Example

```js
var input = document.querySelectorAll('table tr td');

var source = Rx.DOM.fromEvent(input, 'click');

var subscription = source.subscribe(
    function (x) {
        console.log('Next: Clicked!');
    },
    function (err) {
        console.log('Error: ' + err);
    },
    function () {
        console.log('Completed');
    });
```

### Location

File:
- [`/src/fromevent.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/fromevent.js)
- [`/src/fromevent.compat.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/fromevent.compat.js)

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
- [`/tests/fromevent.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/fromevent.js)
