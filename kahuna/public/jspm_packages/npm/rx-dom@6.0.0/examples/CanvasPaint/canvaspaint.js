/* */ 
"format cjs";
(function (window, undefined) {

  // Calcualte offset either layerX/Y or offsetX/Y
  function getOffset(event) {
    return { 
      offsetX: event.offsetX === undefined ? event.layerX : event.offsetX,
      offsetY: event.offsetY === undefined ? event.layerY : event.offsetY
    };
  }

  function intialize () {
    var canvas = document.getElementById('tutorial');
    var colorchart = document.querySelectorAll('#colorchart tr td');

    var ctx = canvas.getContext('2d');
    ctx.beginPath();

    // Get mouse events
    var mouseMoves = Rx.DOM.mousemove(canvas),
        mouseDowns = Rx.DOM.mousedown(canvas),
        mouseUps   = Rx.DOM.mouseup(canvas),
        just = Rx.helpers.just;

    // Get the table events
    var colorValues = Rx.DOM.click(colorchart)
      .tap(function () { ctx.beginPath(); })
      .map(function (e) { return e.target.bgColor; })
      .startWith('#000000');

    // Calculate difference between two mouse moves
    var mouseDiffs = mouseMoves.zip(mouseMoves.skip(1), function (x, y) {
      return { first: getOffset(x), second: getOffset(y) };
    });
    
    // Get merge together both mouse up and mouse down
    var mouseButton = mouseDowns.map(just(true))
      .merge(mouseUps.map(just(false)));

    // Paint if the mouse is down
    var paint = mouseButton.flatMapLatest(function (down) { return down ? mouseDiffs : Rx.Observable.empty(); })
      .combineLatest(colorValues, function (pos, color) {
        return { pos : pos, color: color };
      });

    // Update the canvas
    var subscription = paint.subscribe(function (x) {
      ctx.strokeStyle = x.color;
      ctx.moveTo(x.pos.first.offsetX, x.pos.first.offsetY);
      ctx.lineTo(x.pos.second.offsetX, x.pos.second.offsetY);
      ctx.stroke();
    });
  }

  Rx.DOM.ready().subscribe(intialize);
}(window));