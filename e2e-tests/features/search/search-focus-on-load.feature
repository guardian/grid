Feature: Search box focus on page load
  The search box is ready to type into as soon as the search page loads, with
  the cursor placed after any search that is already there

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: The empty search box is focused when the page loads
    Given the search box is empty
    Then the search box should have keyboard focus
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 13160, 13209
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 79-82, 90

  Scenario: Typing straight away carries on from the text in a search link
    Given I open a search link with the query "cat"
    When I type " dog" without clicking the search box
    Then the search box text should read "cat dog"
  # Evidence: kahuna/public/js/search/query.js lines 430
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 99-101
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70, 84-87
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 12899-12901, 12911-12921, 13082, 13209, 13215-13225

  Scenario: The search box is focused when a search link has a filter chip
    Given I open a search link with the query "credit:Reuters"
    Then a "credit" filter chip should be shown
    And the search box should have keyboard focus
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70, 84-87
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 13082, 13209
