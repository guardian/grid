Feature: Typing in the search box runs a search
  Once I stop typing, the search I typed is put in the page address and the
  results reload. Text that ends up the same as the current search isn't
  searched for again

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: Pausing after typing puts the text in the page address
    Given the search box is empty
    When I type "cat" into the search box
    Then the page address should have the query "cat"
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 31-51, 86-88, 93-97
  # Evidence: kahuna/public/js/search/structured-query/syntax.ts lines 104-118
  # Evidence: kahuna/public/js/search/query.js lines 627-629, 388-394
  # Evidence: kahuna/public/js/search/index.js lines 166-168

  Scenario: Pausing after typing runs one search for the typed text
    Given the search box is empty
    When I type "cat" into the search box
    Then a single search should be run for "cat"
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 47-51, 86-88, 93-97
  # Evidence: kahuna/public/js/search/results.js lines 354, 580-618
  # Evidence: kahuna/public/js/services/api/media-api.js lines 41-47

  Scenario: Adding a space at the end does not run the search again
    Given I open a search link with the query "cat"
    When I type " " into the search box
    Then the search should not be run again
    And the page address should have the query "cat"
  # Evidence: kahuna/public/js/search/structured-query/syntax.ts lines 104-118
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 47-51, 86-88, 93-97
  # Evidence: kahuna/public/js/search/query.js lines 357-363, 388-394

  Scenario: Undoing a change before pausing does not run the search again
    Given I open a search link with the query "cat"
    When I type "s" and quickly delete it again
    Then the search should not be run again
    And the page address should have the query "cat"
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 47-51, 86-88, 93-97
  # Evidence: kahuna/public/js/search/query.js lines 357-363, 388-394, 627-629
