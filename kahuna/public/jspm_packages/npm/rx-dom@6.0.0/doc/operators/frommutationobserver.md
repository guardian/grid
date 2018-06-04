### `Rx.DOM.fromMutationObserver(target, options)`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/frommutationobserver.js "View in source") 

Creates an observable sequence from a `MutationObserver`.  The `MutationObserver` provides developers a way to react to changes in a DOM.  This requires `MutationObserver` to be supported in your browser/JavaScript runtime.

#### Arguments
1. `target` *(Node)*: The Node on which to obserave DOM mutations.
2. `options` *(MutationObserverInit)*: A [`MutationObserverInit`](http://msdn.microsoft.com/en-us/library/windows/apps/dn252345.aspx) object, specifies which DOM mutations should be reported.

#### Returns
*(Observable)*: An observable sequence which contains mutations on the given DOM target.

#### Example
```js
var foo = document.getElementById('foo');

var obs = Rx.DOM.fromMutationObserver(foo, { 
  attributes: true, 
  childList: true, 
  characterData: true,
  attributeFilter: ["id", "dir"]
});

foo.dir = 'rtl';

// Listen for mutations
obs.subscribe(function (mutations) {
    mutations.forEach(function(mutation) {
    console.log("Type of mutation: " + mutation.type);

    if ("attributes" === mutation.type) {
      console.log("Old attribute value: " + mutationRecord.oldValue);
    }
  });
});
```

### Location

File:
- [`/src/frommutationobserver.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/frommutationobserver.js)

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
- [`/tests/tests.frommutationobserver.js](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.frommutationobserver.js)