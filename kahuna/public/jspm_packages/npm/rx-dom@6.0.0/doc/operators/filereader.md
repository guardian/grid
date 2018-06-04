`Rx.DOM.fromReader(file, [progressObserver])`
[&#x24C8;](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/fromreader.js "View in source")

The FileReader object lets web applications asynchronously read the contents of files (or raw data buffers) stored on the user's computer, using File or Blob objects to specify the file or data to read as an observable sequence.

#### Arguments
1. `file` *(`File | Blob`)*: The file to read.
2. `[progressObserver]` *(`Rx.Observer`)*: An optional `Observer` to watch for progress events.

#### Returns
*(Object)*: An object which has the following functions:
- `asArrayBuffer()` - *(`Rx.Observable`)*: This method is used to read the file as an [ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/API/ArrayBuffer) as an Observable stream.
- `asBinaryString()` - *(`Rx.Observable`)*: This method is used to read the file as a binary data string as an Observable stream.
- `asDataURL()` - *(`Rx.Observable`)*: This method is used to read the file as a URL of the file's data as an Observable stream.
- `asText(encoding)` - *(`Rx.Observable`)*: This method is used to read the file as a string as an Observable stream.

#### Example

Read the contents of the file picker only if plain files:
```js
Rx.DOM.change(filesInput)
  .flatMap(function (event) {
    return Rx.Observable.from(event.target.files);
  })
  .filter(function (file) {
    return file.type.match('plain');
  })
  .flatMap(function (file) {
    return Rx.DOM.fromReader(file).asText();
  })
  .subscribe(function (contents) {
    console.log(contents);
  });
```

### Location

File:
- [`/src/fromreader.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/src/fromreader.js)

Dist:
- [`rx.dom.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/dist/rx.dom.js)

Prerequisites:
- [`rx.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/dist/rx.js) |  [`rx.lite.js`](https://github.com/Reactive-Extensions/RxJS/blob/master/rx.lite.js)

NPM Packages:
- [`rx-dom`](https://preview.npmjs.com/package/rx-dom)

NuGet Packages:
- [`RxJS-Bridges-HTML`](http://www.nuget.org/packages/RxJS-Bridges-HTML/)

Unit Tests:
- [`/tests/tests.filereader.js`](https://github.com/Reactive-Extensions/RxJS-DOM/blob/master/tests/tests.filereader.js)
