/* */ 
"format cjs";
(function (window, undefined) {

  function initialize () {
    var dragTarget = document.getElementById('dragTarget');

    // Get the three major events
    var mouseup   = Rx.DOM.mouseup(dragTarget);
    var mousemove = Rx.DOM.mousemove(document);
    var mousedown = Rx.DOM.mousedown(dragTarget);

    var mousedrag = mousedown.flatMap(function (md) {

      // calculate offsets when mouse down
      var startX = md.offsetX, startY = md.offsetY;

      // Calculate delta with mousemove until mouseup
      return mousemove.map(function (mm) {
        mm.preventDefault();

        return {
          left: mm.clientX - startX,
          top: mm.clientY - startY
        };
      }).takeUntil(mouseup);
    });

    // Update position
    subscription = mousedrag.subscribe(function (pos) {          
      dragTarget.style.top = pos.top + 'px';
      dragTarget.style.left = pos.left + 'px';
    });
  }

  Rx.DOM.ready().subscribe(initialize);

}(window));