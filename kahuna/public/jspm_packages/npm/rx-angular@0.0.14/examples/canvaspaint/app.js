/* */ 
"format cjs";
;(function (undefined) {

  angular.module('example', [
    'rx'
  ])
  .directive('rxPaint', function(rx) {
    function getOffset(event) {
      return {
        offsetX: event.offsetX || event.layerX,
        offsetY: event.offsetY || event.layerY
      };
    }
    function returnTrue()  { return 1; }
    function returnFalse() { return 0; }

    return function(scope, element, attrs) {
      console.log('rxPaint');
      var canvas = element[0];
      // if (!element.getContext) {
      //   return;
      // }
      var ctx = canvas.getContext('2d');
      ctx.beginPath();

      var mousemove = rx.Observable.fromEvent(element, 'mousemove');
      var mousedown = rx.Observable.fromEvent(element, 'mousedown');
      var mouseup   = rx.Observable.fromEvent(element, 'mouseup');

      // Calculate mouse deltas
      console.log('cv.onAsObservable', rx.onAsObservable);
      var mouseDiffs = mousemove.bufferWithCount(2, 1).select(function (x) {
          return {
            first: getOffset(x[0]),
            second: getOffset(x[1])
          };
      });

      // Merge mouse down and mouse up
      var mouseButton = mousedown.select(returnTrue)
          .merge(mouseup.select(returnFalse));

      // Determine whether to paint or lift
      var paint = mouseButton.select(function(down) {
        return down ? mouseDiffs : mouseDiffs.take(0);
      }).switchLatest();

      // Paint the results
      paint.subscribe(function (x) {
          ctx.moveTo(x.first.offsetX, x.first.offsetY);
          ctx.lineTo(x.second.offsetX, x.second.offsetY);
          ctx.stroke();
      });

    };
  });

}.call(this));
/*
function getOffset(event) {
    return {
        offsetX: event.offsetX === undefined ? event.layerX : event.offsetX,
        offsetY: event.offsetY === undefined ? event.layerY : event.offsetY
    };
}

$(function () {
    var canvas = document.getElementById('tutorial');
    if (canvas.getContext) {
        var ctx = canvas.getContext('2d');
        ctx.beginPath();

        var cv = $('#tutorial');

        // Calculate mouse deltas
        var mouseMoves = cv.onAsObservable('mousemove');
        var mouseDiffs = mouseMoves.bufferWithCount(2, 1).select(function (x) {
            return { first: getOffset(x[0]), second: getOffset(x[1]) };
        });

        // Merge mouse down and mouse up
        var mouseButton = cv.onAsObservable('mousedown').select(function (x) { return true; })
            .merge(cv.onAsObservable('mouseup').select(function (x) { return false; }))

        // Determine whether to paint or lift
        var paint = mouseButton.select(function (down) { return down ? mouseDiffs : mouseDiffs.take(0) }).switchLatest();

        // Paint the results
        var subscription = paint.subscribe(function (x) {
            ctx.moveTo(x.first.offsetX, x.first.offsetY);
            ctx.lineTo(x.second.offsetX, x.second.offsetY);
            ctx.stroke();
        });
    }
});
*/