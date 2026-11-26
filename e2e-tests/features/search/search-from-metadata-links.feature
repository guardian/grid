Feature: Searching from metadata and label links
  This lets a user click a metadata value or label on an image to search for it.
  Holding Shift adds the value to the current search, and holding Alt excludes it.

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  # ---------------------------------------------------------------------------
  # Shift- and Alt-clicking metadata links (searchWithModifiers)
  # ---------------------------------------------------------------------------
  Scenario: Shift-clicking a credit adds it to the current search
    Given an image credited to "Metadata Links Credit" is shown in the search results for "harbour"
    And I have selected the image
    When I Shift-click the credit "Metadata Links Credit" in the info panel
    Then a single search should be run for 'harbour credit:"Metadata Links Credit"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 18-22, 34-35, 40-50
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 478-480
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 670
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 51-54
  # Evidence: kahuna/public/js/search/index.js lines 166-168

  Scenario: Alt-clicking a credit excludes it from the current search
    Given an image credited to "Metadata Links Credit" is shown in the search results for "harbour"
    And I have selected the image
    When I Alt-click the credit "Metadata Links Credit" in the info panel
    Then a single search should be run for 'harbour -credit:"Metadata Links Credit"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 18-22, 28-29, 40-50
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 478-480
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 670

  Scenario: Alt-clicking a credit with no search text searches for images without it
    Given an image credited to "Metadata Links Credit" is shown in the search results
    And the search box is empty
    And I have selected the image
    When I Alt-click the credit "Metadata Links Credit" in the info panel
    Then a single search should be run for '-credit:"Metadata Links Credit"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 18-22, 31-32, 40-50
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 478-480

  Scenario: Shift-clicking a credit with no search text searches for just that credit
    Given an image credited to "Metadata Links Credit" is shown in the search results
    And the search box is empty
    And I have selected the image
    When I Shift-click the credit "Metadata Links Credit" in the info panel
    Then a single search should be run for 'credit:"Metadata Links Credit"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 18-22, 34-37, 40-50
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 478-480

  Scenario: Shift-clicking a byline in the single image view starts a new search for it
    Given I have opened the single image view of an image with the byline "Metadata Links Photographer"
    When I Shift-click the byline "Metadata Links Photographer"
    Then every search run should be for 'by:"Metadata Links Photographer"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 34-37, 40-50
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 429-431
  # Evidence: kahuna/public/js/image/view.html lines 169-172
  # Evidence: kahuna/public/js/image/index.js lines 25-26

  Scenario: Shift-clicking a label adds it to the current search as a label filter
    Given an image labelled "metadata-links-featured" is shown in the search results for "harbour"
    And I have selected the image
    When I Shift-click the label "metadata-links-featured" in the info panel
    Then a single search should be run for "harbour label:metadata-links-featured"
  # Evidence: kahuna/public/js/search/query-filter.js lines 18-22, 34-35, 40-50
  # Evidence: kahuna/public/js/edits/list-editor-info-panel.html lines 10-12
  # Evidence: kahuna/public/js/edits/list-editor.js lines 153, 200-212
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 1102-1110

  Scenario Outline: Modifier-click searches keep the usage rights setting
    Given all usage rights are <Usage rights setting> in my searches
    And an image credited to "Metadata Links Credit" is shown in the search results for "harbour"
    And I have selected the image
    When I Shift-click the credit "Metadata Links Credit" in the info panel
    Then the new search should <Expectation> images with restricted usage rights
    # title-format: Modifier-click with usage rights <Usage rights setting> keeps the setting
    Examples:
      | Usage rights setting | Expectation   |
      | included             | still include |
      | excluded             | still exclude |
  # Evidence: kahuna/public/js/search/query-filter.js lines 45-49
  # Evidence: kahuna/public/js/search/query.js lines 315-320
  # Evidence: kahuna/public/js/search/results.js lines 617
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 437

  Scenario: A plain click on a credit replaces the current search
    Given an image credited to "Metadata Links Credit" is shown in the search results for "harbour"
    And I have selected the image
    When I click the credit "Metadata Links Credit" in the info panel
    Then a single search should be run for 'credit:"Metadata Links Credit"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 40-43, 55-57
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 478-480

  # ---------------------------------------------------------------------------
  # Clicking labels (queryLabelFilter)
  # ---------------------------------------------------------------------------
  Scenario: Clicking a label in the info panel searches for that label
    Given an image labelled "metadata-links-featured" is shown in the search results
    And I have selected the image
    When I click the label "metadata-links-featured" in the info panel
    Then a single search should be run for "#metadata-links-featured"
  # Evidence: kahuna/public/js/search/query-filter.js lines 59-68
  # Evidence: kahuna/public/js/edits/list-editor-info-panel.html lines 10-12
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 1102-1110

  Scenario: Clicking a label on a search result thumbnail searches for that label
    Given an image labelled "metadata-links-featured" is shown in the search results
    When I click its label "metadata-links-featured" on the thumbnail
    Then a single search should be run for "#metadata-links-featured"
  # Evidence: kahuna/public/js/search/query-filter.js lines 59-68
  # Evidence: kahuna/public/js/edits/list-editor-compact.html lines 8-14
  # Evidence: kahuna/public/js/edits/list-editor.js lines 180-190
  # Evidence: kahuna/public/js/preview/image.html lines 89-97

  Scenario: Clicking a label containing a space searches for the quoted label
    Given an image labelled "front page" is shown in the search results
    When I click its label "front page" on the thumbnail
    Then a single search should be run for '#"front page"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 7-8, 59-63
  # Evidence: kahuna/public/js/edits/list-editor-compact.html lines 8-14
  # Evidence: kahuna/public/js/preview/image.html lines 89-97

  Scenario: Clicking a label containing double quotes ignores the quotes
    Given an image labelled 'say "cheese"' is shown in the search results
    When I click its label 'say "cheese"' on the thumbnail
    Then a single search should be run for '#"say cheese"'
  # Evidence: kahuna/public/js/search/query-filter.js lines 7-8, 59-63
  # Evidence: kahuna/public/js/edits/list-editor-compact.html lines 8-14
