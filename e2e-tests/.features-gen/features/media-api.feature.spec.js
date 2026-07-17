// Generated from: features/media-api.feature
import { test } from "../../steps/fixtures.ts";

test.describe('Frontend loads media-api', () => {

  test('The SPA discovers and requests media-api from the grid-all container', async ({ When, Then, And, page, testContext }) => { 
    await When('I open the Grid application', null, { page, testContext }); 
    await Then('the page exposes a media-api URI link', null, { page }); 
    await And('the media-api is served successfully', null, { testContext }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('features/media-api.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":7,"tags":[],"steps":[{"pwStepLine":7,"gherkinStepLine":8,"keywordType":"Action","textWithKeyword":"When I open the Grid application","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":9,"keywordType":"Outcome","textWithKeyword":"Then the page exposes a media-api URI link","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":10,"keywordType":"Outcome","textWithKeyword":"And the media-api is served successfully","stepMatchArguments":[]}]},
]; // bdd-data-end