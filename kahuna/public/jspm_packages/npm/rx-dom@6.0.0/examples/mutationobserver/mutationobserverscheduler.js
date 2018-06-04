/* */ 
"format cjs";
(function (window, undefined) {

  function initialize() {
    var ul = document.getElementById('results');

    Rx.Observable.range(1, 1000, Rx.Scheduler.microtask)
      .subscribe(
        function (results) {
          var li = document.createElement('li');
          li.innerHTML = results;
          ul.appendChild(li);
        });
  }

  Rx.DOM.ready().subscribe(initialize);

}(window));
