/* */ 
"format cjs";
(function (window, undefined) {

  function getOffset(element) {
    var doc = element.ownerDocument,
      docElem = doc.documentElement,
      body = doc.body,
      clientTop  = docElem.clientTop  || body.clientTop  || 0,
      clientLeft = docElem.clientLeft || body.clientLeft || 0,
      scrollTop  = window.pageYOffset || body.scrollTop,
      scrollLeft = window.pageXOffset || body.scrollLeft;

    return { top : scrollTop  - clientTop, left: scrollLeft - clientLeft };
  }

  function initialize () {
    var i,
      text = 'time flies like an arrow',
      container = document.getElementById('textContainer'),
      mouseMove = Rx.DOM.mousemove(document),

      mouseMoveOffset = mouseMove.map(function(value) {
          var offset = getOffset(container);
          return {
           offsetX : value.clientX - offset.left + document.documentElement.scrollLeft,
           offsetY : value.clientY - offset.top + document.documentElement.scrollTop
         };
      });

  for (i = 0; i < text.length; i++) {
      (function(i) {
        var s = document.createElement('span');
        s.innerHTML = text[i];
        s.style.position = 'absolute';
        container.appendChild(s);                        

        mouseMoveOffset.delay(i * 100).subscribe(function(mouseEvent) {
          s.style.top  = mouseEvent.offsetY + 'px';
          s.style.left = mouseEvent.offsetX + i * 10 + 15 + 'px';
        });
      })(i);
    }
  }

  Rx.DOM.ready().subscribe(initialize);
}(window))
