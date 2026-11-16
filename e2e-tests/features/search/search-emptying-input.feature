Feature: Emptying the search box
  Deleting all the text in the search box clears the search, so the page
  address no longer has a query and the results show every image

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: Deleting all the text removes the query from the page address
    Given I open a search link with the query "cat"
    When I delete all the text in the search box
    Then the page address should not have a query
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 114-121
  # Evidence: kahuna/public/js/components/gr-cql-input/syntax.ts lines 30-33
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 47-51, 56-59, 86-88, 93-97
  # Evidence: kahuna/public/js/search/query.js lines 388-394, 627-629
  # Evidence: kahuna/public/js/search/index.js lines 166-168

  Scenario: Deleting all the text runs a search with no search text
    Given I open a search link with the query "cat"
    When I delete all the text in the search box
    Then a single search should be run with no search text
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 47-51, 86-88, 93-97
  # Evidence: kahuna/public/js/search/results.js lines 354, 580-618
  # Evidence: kahuna/public/js/services/api/media-api.js lines 41-47
