Feature: Free text search placeholder
  The search box in the top bar shows hint text when it is empty, telling the
  user what kind of search they are about to run

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page
  @todo
  Scenario: An empty search box shows the default placeholder
    Given the CQL search input feature switch is off
    And the search box is empty
    Then the search box placeholder should read "Search for images... (type + for advanced search)"
  # Evidence: kahuna/public/js/components/gr-chips/gr-text-chip.html lines 1-5
  # Evidence: kahuna/public/js/components/gr-chips/gr-text-chip.js lines 28-29
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.js lines 29, 65-68
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 71, 90
  @todo
  Scenario: The placeholder is hidden once I type free text
    Given the CQL search input feature switch is off
    And the search box is empty
    When I type "cat" into the search box
    Then the search box placeholder should not be visible
  # Evidence: kahuna/public/js/components/gr-chips/gr-text-chip.html lines 1-9
  @todo
  Scenario: The placeholder still shows when only filter chips are present
    Given the CQL search input feature switch is off
    When I open a search link with the query "credit:Reuters"
    Then a "credit" filter chip should be shown
    And the search box placeholder should read "Search for images... (type + for advanced search)"
  # Evidence: kahuna/public/js/search/structured-query/syntax.ts lines 75-90
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.html lines 3-11
  @todo
  Scenario: Ticking AI search switches to the AI placeholder
    Given AI search is enabled
    And the CQL search input feature switch is off
    And the search box is empty
    When I tick the "AI search" checkbox
    Then the search box placeholder should read "Search for conceptual images using AI search..."
  # Evidence: kahuna/public/js/search/query.html lines 2-10, 13-15
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 71-77
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.js lines 30, 65-68, 183
  @todo
  Scenario: Unticking AI search restores the default placeholder
    Given AI search is enabled
    And the CQL search input feature switch is off
    And the "AI search" checkbox is ticked
    When I untick the "AI search" checkbox
    Then the search box placeholder should read "Search for images... (type + for advanced search)"
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.js lines 29-30, 65-68
  @todo
  Scenario: Opening a link with AI search on shows the AI placeholder
    Given AI search is enabled
    And the CQL search input feature switch is off
    When I open a search link with AI search turned on
    Then the "AI search" checkbox should be ticked
    And the search box placeholder should read "Search for conceptual images using AI search..."
  # Evidence: kahuna/public/js/search/query.js lines 120-125, 644-654
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.js lines 65-68
  @todo
  Scenario: Without AI search the default placeholder is always shown
    Given AI search is disabled
    And the CQL search input feature switch is off
    When I open a search link with AI search turned on
    Then the "AI search" checkbox should not be shown
    And the search box placeholder should read "Search for images... (type + for advanced search)"
  # Evidence: kahuna/public/js/search/query.js lines 120-123
  # Evidence: kahuna/public/js/search/query.html lines 2-3
  @todo
  Scenario: The CQL search input shows its own placeholder
    Given the CQL search input feature switch is on
    And the search box is empty
    Then the search box placeholder should read "Search for images… (type + for advanced search)"
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 79-82, 90
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70
  # Evidence: kahuna/public/js/components/gr-feature-switch-panel/gr-feature-switch-panel.tsx lines 16-22
  @todo
  Scenario: Ticking AI search does not change the CQL search input placeholder
    Given AI search is enabled
    And the CQL search input feature switch is on
    And the search box is empty
    When I tick the "AI search" checkbox
    Then the search box placeholder should read "Search for images… (type + for advanced search)"
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 71-82
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 66-71
