import angular from 'angular';

export var autoWidth = angular.module('gr.autoWidth', []);

// Note: you *MUST* set ng:trim="false" on the input for the width to
// correctly represent leading/trailing spaces
autoWidth.directive('grAutoWidth', ['$document', function ($document) {
    return {
        require: 'ngModel',
        restrict: 'A',
        link: function(scope, element, attrs, ctrl) {
            function computedStyle(property) {
                var el = element[0];
                if (el.currentStyle) {
                    return el.currentStyle[property];
                } else if (window.getComputedStyle) {
                    var styles = document.defaultView.getComputedStyle(el, null);
                    return styles.getPropertyValue(property);
                }
            }

            var docBody = $document.find('body');

            // Clone element and apply identical styling
            var doppelganger = angular.element('<div></div>');
            ['padding', 'letter-spacing', 'font-family',
             'font-size', 'font-weight'].forEach(function(prop) {
                 doppelganger.css(prop, computedStyle(prop));
             });

            // Out of sight, out of mind
            doppelganger.css('position', 'absolute');
            doppelganger.css('left', '-9999px');
            doppelganger.css('top', '-9999px');
            doppelganger.css('whiteSpace', 'nowrap');

            docBody.append(doppelganger);

            // Update doppelganger with model content, apply resulting width
            scope.$watchCollection(function() {
                return [scope.$eval(attrs.ngModel), element.attr('placeholder')];
            }, function() {
                var width;
                var text = ctrl.$viewValue || element.attr('placeholder') || '';
                doppelganger.html(text.replace(/ /g, '&nbsp;'));
                width = doppelganger.prop('offsetWidth') + 1; // conservative padding
                element.css('width', width + 'px');
            });

            // Garbage collect helper fragment
            scope.$on('$destroy', function() {
                doppelganger.remove();
            });
        }
    };
}]);
