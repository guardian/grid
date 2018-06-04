/* */ 
"format cjs";
(function () {
  function getTitle(text) {
    return text.match('<title>(.*)?</title>')[1];
  }

  function main() {
    var result = document.querySelector('#result');

    var request = Rx.DOM.ajax({
      url: 'http://updates.html5rocks.com',
      crossDomain: true,
      async: true
    });

    request.subscribe(
      function (x) {
        result.textContent = 'Page Title: ' + getTitle(x.xhr.responseText);
      },
      function (err) {
        result.textContent = 'Error response: ' + err;
      }
    )
  }

  Rx.DOM.ready().subscribe(main);
}());
