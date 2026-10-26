Feature: Search box focus on page load (chips input)
  The search box is ready to type into as soon as the search page loads, with
  the cursor placed after any search text that is already there

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page
    And the CQL search input feature switch is off
    # The legacy chips input is used for these scenarios

  Scenario: The empty search box is focused when the page loads
    Given the search box is empty
    Then the search box should have keyboard focus
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 71-72, 103-106
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.js lines 46-52, 90-98, 132-138, 191
  # Evidence: kahuna/public/js/components/gr-chips/gr-chip-input.js lines 57-75

  Scenario: Typing straight away carries on from the text in a search link
    Given I open a search link with the query "cat"
    When I type " dog" without clicking the search box
    Then the search box text should read "cat dog"
  # Evidence: kahuna/public/js/search/query.js lines 430
  # Evidence: kahuna/public/js/search/structured-query/structured-query.js lines 103-106
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.js lines 46-52, 132-138
  # Evidence: kahuna/public/js/components/gr-chips/gr-chip-input.js lines 57-75

  Scenario: The free text box is focused when a search link has a filter chip
    Given I open a search link with the query "credit:Reuters"
    Then a "credit" filter chip should be shown
    And the search box should have keyboard focus
  # Evidence: kahuna/public/js/search/structured-query/syntax.ts lines 76-84
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.js lines 46-52, 132-138
  # Evidence: kahuna/public/js/components/gr-chips/gr-chips.css lines 24-28
