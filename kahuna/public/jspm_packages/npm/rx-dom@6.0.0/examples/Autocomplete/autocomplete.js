/* */ 
"format cjs";
;(function (window, undefined) {

  function searchWikipedia (term) {
    var url = 'http://en.wikipedia.org/w/api.php?action=opensearch&format=json&search='
      + encodeURIComponent(term) + '&callback=JSONPCallback';
    return Rx.DOM.jsonpRequest(url);
  }

  function clearChildren (e) {
    while (e.firstChild) { e.removeChild(e.firstChild); }
  }

  function createChildren(results, parent) {
    for (var i = 0, len = results.length; i < len; i++) {
      createElement(results[i], parent);
    }
  }

  function createElement(text, parent) {
    var li = document.createElement('li');
    li.innerHTML = text;
    parent.appendChild(li);
  }

  function initialize () {
    var input = document.getElementById('textInput'),
        ul = document.getElementById('results');

    var keyup = Rx.DOM.keyup(input)
      .map(function (ev) { return ev.target.value; })
      .filter(function(text) { return text.length > 2; })
      .debounce(500)
      .distinctUntilChanged();

    var searcher = keyup.flatMapLatest(searchWikipedia).map(function(d) { return d.response[1]; });

    searcher.subscribe(
      function (results) {
        clearChildren(ul);
        createChildren(results, ul);
      },
      function (error) {
        clearChildren(ul);
        createElement('Error: ' + error.message, ul);
      }
    );
  }

  Rx.DOM.ready().subscribe(initialize);
}(window));
