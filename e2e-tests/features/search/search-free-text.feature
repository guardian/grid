Feature: Free text search placeholder
  The search box in the top bar shows hint text when it is empty, telling the
  user what kind of search they are about to run

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: An empty search box shows the default placeholder
    Given the search box is empty
    Then the search box placeholder should read "Search for images… (type + for advanced search)"
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 79-82
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 13000-13006, 13032

  Scenario: The placeholder is hidden once I type free text
    Given the search box is empty
    When I type "cat" into the search box
    Then the search box placeholder should not be visible
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 13005-13006, 13032

  Scenario: The placeholder is hidden when the search box has a filter chip
    Given I open a search link with the query "credit:Reuters"
    Then a "credit" filter chip should be shown
    And the search box placeholder should not be visible
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 79-82, 90-99
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70-84
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 13000-13006
