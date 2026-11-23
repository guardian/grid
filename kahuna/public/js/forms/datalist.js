import angular from 'angular';

import template from './datalist.html';
import '../util/eq';

export var datalist = angular.module('kahuna.forms.datalist', ['util.eq']);


datalist.directive('grDatalist', ['$q', '$timeout', function($q, $timeout) {
    return {
        restrict: 'E',
        transclude: true,
        scope: {
            search:   '&grSearch',
            onSelect: '&?grOnSelect',
            showToggle: '<?grShowToggle'
        },
        template: template,
        controllerAs: 'ctrl',
        controller: ['$element', function($element) {
            var ctrl = this;
            ctrl.$onInit = () => {
              var selectedIndex = 0;

              ctrl.results = [];

              // Keeps the keyboard-selected option visible within the scrollable list
              const scrollSelectedIntoView = () => {
                  const list = $element[0].querySelector('.datalist__options');
                  const option = list && list.querySelector('.datalist__option--selected');
                  if (!option) { return; }

                  const optionTop = option.offsetTop; // list is the positioned offsetParent
                  const optionBottom = optionTop + option.offsetHeight;
                  if (optionTop < list.scrollTop) {
                      list.scrollTop = optionTop;
                  } else if (optionBottom > list.scrollTop + list.clientHeight) {
                      list.scrollTop = optionBottom - list.clientHeight;
                  }
              };

              ctrl.moveIndex = movement => {
                  selectedIndex = (selectedIndex + movement + ctrl.results.length) %
                                  ctrl.results.length;
                  // Wait for the selected class to be rendered
                  $timeout(scrollSelectedIntoView, 0, false);
              };

              ctrl.setIndex = key => selectedIndex = key;

              ctrl.isSelected = key => key === selectedIndex;

              ctrl.searchFor = (q) => {
                  return $q.when(ctrl.search({ q })).
                      then(results => ctrl.results = results).
                      then(() => selectedIndex = 0);
              };

              ctrl.setValueTo = value => {
                  ctrl.value = value;
                  if (ctrl.onSelect) {
                      ctrl.onSelect({$value: value});
                  }
              };

              ctrl.setValueFromSelectedIndex = () => {
                  ctrl.setValueTo(ctrl.results[selectedIndex]);
              };

              // Opens the full list (search with an empty query), or closes it
              ctrl.toggle = $event => {
                  if (ctrl.active) {
                      ctrl.active = false;
                      ctrl.reset();
                  } else {
                      const input = $element[0].querySelector('input');
                      const currentValue = input && input.value;
                      ctrl.searchFor('').then(() => {
                          const currentIndex = ctrl.results.indexOf(currentValue);
                          if (currentIndex > -1) {
                              selectedIndex = currentIndex;
                          }
                          ctrl.active = ctrl.results.length > 0;
                          // Opened from the keyboard: hand focus to the input so the arrow keys work,
                          // without letting its focus handler replace the full list with a filtered one
                          if (ctrl.active && input && $event && $event.detail === 0 &&
                              document.activeElement !== input) {
                              ctrl.skipFocusSearch = true;
                              input.focus();
                          }
                          // Wait for the options list to be rendered
                          $timeout(scrollSelectedIntoView, 0, false);
                      });
                  }
              };

              ctrl.reset = () => {
                  selectedIndex = 0;
                  ctrl.results = [];
              };
            };
          }
        ],
        bindToController: true
    };
}]);


datalist.directive('grDatalistInput',
                   ['$timeout', 'onValChange',
                   function($timeout, onValChange) {
    return {
        restrict: 'A',
        require:['^grDatalist', '?ngModel'],
        link: function(scope, element, attrs, [parentCtrl, ngModel]) {
            const valueSelectorFn = attrs.grDatalistInputSelector;
            const valueUpdaterFn  = attrs.grDatalistInputUpdater;
            const onCancel = attrs.grDatalistInputOnCancel;

            function valueSelector(value) {
                if (valueSelectorFn) {
                    return scope.$eval(valueSelectorFn, {$value: value});
                } else {
                    return value;
                }
            }
            function valueUpdater(currentValue, selectedValue) {
                if (valueUpdaterFn) {
                    return scope.$eval(valueUpdaterFn, {
                        $currentValue: currentValue,
                        $selectedValue: selectedValue
                    });
                } else {
                    return selectedValue;
                }
            }

            // This feels like it should be set to this directive, but it is
            // needed in the template so we set it here.
            parentCtrl.active = false;

            const input = angular.element(element[0]);
            const keys = { 38: 'up', 40: 'down', 13: 'enter', 27: 'esc', 9: 'tab' };
            const keyFuncs = {
                up:    () => parentCtrl.moveIndex(-1),
                down:  () => parentCtrl.moveIndex(+1),
                esc:   deactivate
            };

            // Enter is on keydown to prevent the submit event being
            // propagated up.
            input.on('keydown', event => {
                if (keys[event.which] === 'enter' && parentCtrl.active) {
                    event.preventDefault();
                    scope.$apply(parentCtrl.setValueFromSelectedIndex);
                }
                //to prevent the caret moving to the start/end of the input box
                if (parentCtrl.active &&
                    ( keys[event.which] === 'up' || keys[event.which] === 'down' ) ) {
                    event.preventDefault();
                    event.stopPropagation();
                    // keydown repeats while the key is held, so the selection keeps moving
                    scope.$apply(keyFuncs[keys[event.which]]);
                }
            });

            input.on('keyup', event => {
                const key = keys[event.which];
                const func = keyFuncs[key];

                if ((key === 'up' || key === 'down') && parentCtrl.active) {
                    // Already handled on keydown
                    event.preventDefault();
                } else if (func && parentCtrl.active) {
                    event.preventDefault();
                    scope.$apply(func);
                } else if (keys[event.which] !== 'enter' && keys[event.which] !== 'esc') {
                    searchAndActivate();
                } else if (keys[event.which] === 'esc' && !parentCtrl.active) {
                    scope.$apply(onCancel);
                }
            });

            input.on('focus', () => {
                if (parentCtrl.skipFocusSearch) {
                    parentCtrl.skipFocusSearch = false;
                } else {
                    searchAndActivate();
                }
            });
            input.on('click', searchAndActivate);

            // This is done to make the results disappear when you select
            // somewhere else on the document, but still allowing you to click
            // a result. What would have been nicer would be to have looked for
            // a `document.click` and `stopPropagation`ed on the parent element.
            // Unfortunately this isn't possible as a `document.click` is fired
            // from the submit button of a form (which most forms have).
            input.on('blur', () => $timeout(deactivate, 150));

            scope.$watch(() => parentCtrl.value, onValChange(newVal => {
                const updatedValue = valueUpdater(input.val(), newVal);
                ngModel.$setViewValue(updatedValue, 'gr:datalist:update');
                ngModel.$commitViewValue();
                ngModel.$render();

                deactivate();
            }));

            function searchAndActivate() {
                parentCtrl.searchFor(valueSelector(input.val())).then(activate);
            }

            function activate(results) {
                const inputMatchesFirstResult = valueSelector(input.val()) === results[0];
                const isOnlyResult = results.length === 1 && inputMatchesFirstResult;
                const noResults = results.length === 0 || isOnlyResult;

                parentCtrl.active = !noResults;

            }

            function deactivate() {
                parentCtrl.active = false;
                parentCtrl.reset();
            }
        }
    };
}]);
