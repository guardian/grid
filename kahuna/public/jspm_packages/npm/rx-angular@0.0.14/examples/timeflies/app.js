/* */ 
"format cjs";
;(function (undefined) {

  angular.module('example', [
    'rx'
  ])
  .directive('rxTimeFlies', function($document, $window, rx) {

    function getOffset(element) {
      var doc = element.ownerDocument,
          docElem = doc.documentElement,
          body = doc.body,
          clientTop  = docElem.clientTop  || body.clientTop  || 0,
          clientLeft = docElem.clientLeft || body.clientLeft || 0,
          scrollTop  = $window.pageYOffset,
          scrollLeft = $window.pageXOffset;

      return {
        top: scrollTop   - clientTop,
        left: scrollLeft - clientLeft };
    }

    return function(scope, element, attrs) {
      // Get the three major events
      var text = attrs.rxTimeFlies.split('');
      var mousemove = rx.Observable.fromEvent($document, 'mousemove');

      // Get the offset on mousemove from the element
      var mouseMoveOffset = mousemove.select(function (e) {
        var offset = getOffset(element[0]);
        return {
          offsetX : e.clientX - offset.left + $window.document.documentElement.scrollLeft,
          offsetY : e.clientY - offset.top  + $window.document.documentElement.scrollTop
        };
      });

      angular.forEach(text, function(letter, index) {
        // Add an element for each letter
        var s = $window.document.createElement('span');
        s.innerHTML = letter;
        s.style.position = 'absolute';
        element.append(s);

        // move each letter with a delay based upon overall position
        mouseMoveOffset.delay(index * 50).subscribe(function (e) {
          s.style.top  = e.offsetY + 'px';
          s.style.left = e.offsetX + index * 10 + 15 + 'px';
        });
      });

    };
  });

}.call(this));
