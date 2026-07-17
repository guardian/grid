// Generated from: features/kahuna.feature
import { test } from "../../steps/fixtures.ts";

test.describe('Kahuna service availability', () => {

  test('Healthcheck responds OK', async ({ When, Then, request, testContext }) => { 
    await When('I request the Kahuna healthcheck endpoint', null, { request, testContext }); 
    await Then('the response is successful', null, { testContext }); 
  });

  test('Kahuna serves the application', async ({ When, Then, request, testContext }) => { 
    await When('I request the Kahuna root path without following redirects', null, { request, testContext }); 
    await Then('the response status is below 500', null, { testContext }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('features/kahuna.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":6,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Action","textWithKeyword":"When I request the Kahuna healthcheck endpoint","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":8,"keywordType":"Outcome","textWithKeyword":"Then the response is successful","stepMatchArguments":[]}]},
  {"pwTestLine":11,"pickleLine":10,"tags":[],"steps":[{"pwStepLine":12,"gherkinStepLine":11,"keywordType":"Action","textWithKeyword":"When I request the Kahuna root path without following redirects","stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":12,"keywordType":"Outcome","textWithKeyword":"Then the response status is below 500","stepMatchArguments":[{"group":{"start":29,"value":"500"},"parameterTypeName":"int"}]}]},
]; // bdd-data-end