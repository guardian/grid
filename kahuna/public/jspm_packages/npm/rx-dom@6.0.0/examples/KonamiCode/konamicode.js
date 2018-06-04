/* */ 
"format cjs";
(function (window, undefined) {

  function fadeOut(element) {
    var opacity = 1;
    element.style.opacity = opacity;

    var subscription = Rx.Scheduler.timeout.scheduleRecursiveWithRelative(100, function (self) {
      if (opacity === 0) {
        subscription.dispose();
        return;
      }

      opacity -= 0.1;
      element.style.opacity = opacity;
      self(100);
    });
  }

  function initialize() {

    var codes = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65],
      konami = Rx.Observable.from(codes),
      result = document.getElementById('result');

    Rx.DOM.keyup(document)
      .pluck('keyCode')
      .bufferWithCount(10, 1)
      .filter(function (data) { return data.toString() === codes.toString(); })
      .subscribe(function () {
        result.innerHTML = 'KONAMI!';
        fadeOut(result);
      });
  }

  Rx.DOM.ready().subscribe(initialize);
})(window);