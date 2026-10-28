Feature: Search box restored from the page address
  The search box shows the search in the page address, whether I open a
  search link or move back and forward through my searches

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: Opening a search link fills in the search box
    Given I open a search link with the query "cat"
    Then the search box text should read "cat"
  # Evidence: kahuna/public/js/search/query.js lines 556, 563-567
  # Evidence: kahuna/public/js/search/query.html lines 13-14
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 99-101
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70, 84-87

  Scenario: Going back shows the previous search in the search box
    Given I have searched for "cat" and then for "cat dog"
    When I go back in the browser
    Then the search box text should read "cat"
    And the page address should have the query "cat"
  # Evidence: kahuna/public/js/search/query.js lines 572-578
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 99-101
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 84-87

  Scenario: Going forward shows the later search again
    Given I have searched for "cat" and then for "cat dog"
    And I have gone back in the browser
    When I go forward in the browser
    Then the search box text should read "cat dog"
    And the page address should have the query "cat dog"
  # Evidence: kahuna/public/js/search/query.js lines 572-578
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 99-101
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 84-87

  Scenario: Going back to before the first search empties the search box
    Given I have searched for "cat"
    When I go back in the browser
    Then the search box should be empty
    And the page address should not have a query
  # Evidence: kahuna/public/js/search/query.js lines 561, 572-578
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 99-101
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 84-87
