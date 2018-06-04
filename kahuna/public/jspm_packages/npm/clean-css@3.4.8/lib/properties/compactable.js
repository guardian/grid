/* */ 
(function(process) {
  var breakUp = require('./break-up');
  var canOverride = require('./can-override');
  var restore = require('./restore');
  var compactable = {
    'color': {
      canOverride: canOverride.color,
      defaultValue: 'transparent',
      shortestValue: 'red'
    },
    'background': {
      components: ['background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment', 'background-origin', 'background-clip', 'background-color'],
      breakUp: breakUp.multiplex(breakUp.background),
      defaultValue: '0 0',
      restore: restore.multiplex(restore.background),
      shortestValue: '0',
      shorthand: true
    },
    'background-clip': {
      canOverride: canOverride.always,
      defaultValue: 'border-box',
      shortestValue: 'border-box'
    },
    'background-color': {
      canOverride: canOverride.color,
      defaultValue: 'transparent',
      multiplexLastOnly: true,
      nonMergeableValue: 'none',
      shortestValue: 'red'
    },
    'background-image': {
      canOverride: canOverride.backgroundImage,
      defaultValue: 'none'
    },
    'background-origin': {
      canOverride: canOverride.always,
      defaultValue: 'padding-box',
      shortestValue: 'border-box'
    },
    'background-repeat': {
      canOverride: canOverride.always,
      defaultValue: ['repeat'],
      doubleValues: true
    },
    'background-position': {
      canOverride: canOverride.always,
      defaultValue: ['0', '0'],
      doubleValues: true,
      shortestValue: '0'
    },
    'background-size': {
      canOverride: canOverride.always,
      defaultValue: ['auto'],
      doubleValues: true,
      shortestValue: '0 0'
    },
    'background-attachment': {
      canOverride: canOverride.always,
      defaultValue: 'scroll'
    },
    'border': {
      breakUp: breakUp.border,
      canOverride: canOverride.border,
      components: ['border-width', 'border-style', 'border-color'],
      defaultValue: 'none',
      restore: restore.withoutDefaults,
      shorthand: true
    },
    'border-color': {
      canOverride: canOverride.color,
      defaultValue: 'none',
      shorthand: true
    },
    'border-style': {
      canOverride: canOverride.always,
      defaultValue: 'none',
      shorthand: true
    },
    'border-width': {
      canOverride: canOverride.unit,
      defaultValue: 'medium',
      shortestValue: '0',
      shorthand: true
    },
    'list-style': {
      components: ['list-style-type', 'list-style-position', 'list-style-image'],
      canOverride: canOverride.always,
      breakUp: breakUp.listStyle,
      restore: restore.withoutDefaults,
      defaultValue: 'outside',
      shortestValue: 'none',
      shorthand: true
    },
    'list-style-type': {
      canOverride: canOverride.always,
      defaultValue: '__hack',
      shortestValue: 'none'
    },
    'list-style-position': {
      canOverride: canOverride.always,
      defaultValue: 'outside',
      shortestValue: 'inside'
    },
    'list-style-image': {
      canOverride: canOverride.always,
      defaultValue: 'none'
    },
    'outline': {
      components: ['outline-color', 'outline-style', 'outline-width'],
      breakUp: breakUp.outline,
      restore: restore.withoutDefaults,
      defaultValue: '0',
      shorthand: true
    },
    'outline-color': {
      canOverride: canOverride.color,
      defaultValue: 'invert',
      shortestValue: 'red'
    },
    'outline-style': {
      canOverride: canOverride.always,
      defaultValue: 'none'
    },
    'outline-width': {
      canOverride: canOverride.unit,
      defaultValue: 'medium',
      shortestValue: '0'
    },
    '-moz-transform': {canOverride: canOverride.sameFunctionOrValue},
    '-ms-transform': {canOverride: canOverride.sameFunctionOrValue},
    '-webkit-transform': {canOverride: canOverride.sameFunctionOrValue},
    'transform': {canOverride: canOverride.sameFunctionOrValue}
  };
  var addFourValueShorthand = function(prop, components, options) {
    options = options || {};
    compactable[prop] = {
      canOverride: options.canOverride,
      components: components,
      breakUp: options.breakUp || breakUp.fourValues,
      defaultValue: options.defaultValue || '0',
      restore: options.restore || restore.fourValues,
      shortestValue: options.shortestValue,
      shorthand: true
    };
    for (var i = 0; i < components.length; i++) {
      compactable[components[i]] = {
        breakUp: options.breakUp || breakUp.fourValues,
        canOverride: options.canOverride || canOverride.unit,
        defaultValue: options.defaultValue || '0',
        shortestValue: options.shortestValue
      };
    }
  };
  ['', '-moz-', '-o-', '-webkit-'].forEach(function(prefix) {
    addFourValueShorthand(prefix + 'border-radius', [prefix + 'border-top-left-radius', prefix + 'border-top-right-radius', prefix + 'border-bottom-right-radius', prefix + 'border-bottom-left-radius'], {
      breakUp: breakUp.borderRadius,
      restore: restore.borderRadius
    });
  });
  addFourValueShorthand('border-color', ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'], {
    breakUp: breakUp.fourValues,
    canOverride: canOverride.color,
    defaultValue: 'none',
    shortestValue: 'red'
  });
  addFourValueShorthand('border-style', ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'], {
    breakUp: breakUp.fourValues,
    canOverride: canOverride.always,
    defaultValue: 'none'
  });
  addFourValueShorthand('border-width', ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'], {
    defaultValue: 'medium',
    shortestValue: '0'
  });
  addFourValueShorthand('padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
  addFourValueShorthand('margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']);
  for (var property in compactable) {
    if (compactable[property].shorthand) {
      for (var i = 0,
          l = compactable[property].components.length; i < l; i++) {
        compactable[compactable[property].components[i]].componentOf = property;
      }
    }
  }
  module.exports = compactable;
})(require('process'));
