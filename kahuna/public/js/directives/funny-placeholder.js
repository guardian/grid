import angular from 'angular';
import controlsDirectives from '../directives';

controlsDirectives.directive('uiFunnyPlaceholder', function() {
    var people = [
        'George Osborne',
        'A teary Nick Clegg',
        'Pop singer Rihanna',
        'US actress and director Angelina Jolie',
        'George W. Bush'
    ];

    var actions = [
        'eating',
        'caught with',
        'wrestling',
        'chants while marching for a third night of protests about',
        'making a toast to'
    ];

    var things = [
        'a large pheasant burger',
        'two human-sized rubber ducks',
        'a proposal for a new Union Jack',
        'the recently passed Owning The Internet bill',
        'the first crewed spaceship to reach Mars',
        'the largest ever koala recorded in history'
    ];

    function random(array) {
        var index = Math.floor(Math.random() * array.length);
        return array[index];
    }

    var funnyDescription = () => [people, actions, things].map(random).join(' ');

    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            var placeholder = ((element.attr('placeholder') || '') + ' e.g. ' + funnyDescription()).trim();
            element.attr('placeholder', placeholder);
        }
    };
});
