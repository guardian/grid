import angular from 'angular';

export const string = angular.module('util.string', []);

// Takes an array and generates a '1, 2, 3 [joiner] 4' string
string.value('humanJoin', function humanJoin(list, joiner) {
    const allButLastTwo = list.slice(0, -2);
    const lastTwo = list.slice(-2).join(` ${joiner} `);
    return allButLastTwo.concat(lastTwo).join(', ');
});

string.value('stripMargin', function(template, ...args) {
  const result = template.reduce((acc, part, i) => acc + args[i - 1] + part);
  return result.replace(/\r?(\n)\s*\|/g, '$1');
});
