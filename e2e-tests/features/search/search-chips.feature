Feature: Creating search filter chips
  Search filters can be entered manually or completed from suggestions for
  field names and values

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: Typing a chip key followed by a colon creates a chip without choosing a suggestion
    Given the search box is empty
    When I type "city:Bristol" into the search box
    Then a "city" filter chip should be shown
    And the "city" filter chip should have the value "Bristol"
  # Evidence: kahuna/public/js/search/query.html lines 13-15
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 121
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-50, 70-84
  # Evidence: kahuna/public/js/components/gr-cql-input/syntax.ts lines 77-92
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11819-11853, 13569-13578, 13649-13670

  Scenario: Selecting a suggested field name creates a chip ready for its value
    Given I am choosing a filter field with the partial name "cit"
    When I choose "city" from the filter field suggestions
    Then a "city" filter chip should be shown
    And the "city" filter chip should be waiting for a value
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 121
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11667-11685, 11819-11853, 13579-13589, 13605-13617, 13639-13647

  Scenario: Selecting a chip value suggestion completes the chip value
    Given I am choosing a value for the "fileType" filter
    When I choose "png" from the filter value suggestions
    Then a "fileType" filter chip should be shown
    And the "fileType" filter chip should have the value "png"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 48, 130-132
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11667-11685, 11843-11853, 13619-13636, 13649-13670

  Scenario Outline: Selecting an enabled supplemental option completes the corresponding chip
    Given I am choosing a value for the "<Field>" filter
    When I choose "<Value>" from the filter value suggestions
    Then a "<Field>" filter chip should be shown
    And the "<Field>" filter chip should have the value "<Value>"
    # title-format: Select <Field>:<Value> from enabled option suggestions

    Examples: Select <Field>:<Value> from enabled options
      | Field            | Value                  |
      | fileType         | tiff                   |
      | subject          | weather                |
      | usages@platform  | download               |
      | usages@status    | removed                |
      | persisted        | persistence-identifier |
      | persisted        | commissioned-agency    |
      | persisted        | edited                 |
      | is               | reapable               |
      | is               | agency-pick            |
      | fixtureSubject   | sport                  |
      | fixtureHasPerson | true                   |
      | fixtureHasPerson | false                  |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 26-91, 130-132, 153-155, 166-190, 288-305
  # Evidence: e2e-tests/setup/config.ts lines 39-66, 96-97

  Scenario: Enabling Photo Sales adds its usage platform suggestion
    Given the send to Photo Sales feature is enabled
    And I am choosing a value for the "usages@platform" filter
    When I choose "Added to Photo Sales" from the filter value suggestions
    Then the "usages@platform" filter chip should have the value "Added to Photo Sales"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 277-288
  # Evidence: e2e-tests/steps/image-usages/image-usages.steps.ts lines 239-241

  Scenario Outline: Selecting a configured API value completes the corresponding chip
    Given I am choosing a value for the "<Field>" filter
    When I choose "<Value>" from the filter value suggestions
    Then a "<Field>" filter chip should be shown
    And the "<Field>" filter chip should have the value "<Value>"
    # title-format: Select <Field>:<Value> from usage-rights suggestions

    Examples: Select <Field>:<Value> from usage-rights suggestions
      | Field    | Value                           |
      | by       | Example Contracted Photographer |
      | supplier | Ronald Grant Archive            |
      | category | pr-and-third-party              |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 113-120, 157-159, 206-242
  # Evidence: kahuna/public/js/services/api/edits-api.js lines 63-65
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 84-102
  # Evidence: dev/script/generate-config/service-config.js lines 54-82
  # Evidence: e2e-tests/setup/config.ts lines 229-239

  Scenario Outline: Manually entered supplemental values do not require choosing a suggestion
    Given the search box is empty
    When I type '<Query>' into the search box
    Then a "<Field>" filter chip should be shown
    And the "<Field>" filter chip should have the value "<Value>"
    # title-format: Enter <Field>:<Value> manually

    Examples: Enter <Field>:<Value> manually
      | Query                                               | Field            | Value                              |
      | illustrator:Example Contracted Illustrator          | illustrator      | Example Contracted Illustrator     |
      | fixtureReference:search-chips-harbour-daylight-jpeg | fixtureReference | search-chips-harbour-daylight-jpeg |
      | usages@status:unknown                               | usages@status    | unknown                            |
      | credit:Search Chips Manual Credit                   | credit           | Search Chips Manual Credit         |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54, 70-84, 115-122
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 124-127, 134-137, 169-171, 188-199
  # Evidence: e2e-tests/setup/config.ts lines 50-58

  Scenario: A typed credit prefix retrieves a seeded completion that can be selected
    Given I am choosing a credit value starting with "Search Chips Shared"
    When I choose "Search Chips Shared Credit" from the filter value suggestions
    Then the "credit" filter chip should have the value "Search Chips Shared Credit"
    And the chip query should be 'credit:"Search Chips Shared Credit"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 124-127, 264-268
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 62-76

  Scenario: A typed photoshoot prefix retrieves a seeded completion that can be selected
    Given I am choosing a photoshoot value starting with "Search Chips Harbour"
    When I choose "Search Chips Harbour Shoot" from the filter value suggestions
    Then the "photoshoot" filter chip should have the value "Search Chips Harbour Shoot"
    And the chip query should be 'photoshoot:"Search Chips Harbour Shoot"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 169-175, 266-270
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 77-98

  Scenario: Disabling the reaper removes the persisted field
    Given the reaper feature is disabled
    And the search box is empty
    When I type "+per" into the search box
    Then the filter suggestions should include "person"
    And the filter suggestions should not include "persisted"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 58-73, 164-168
  # Evidence: kahuna/app/views/main.scala.html lines 103

  Scenario: Disabling the reaper removes the reapable suggestion
    Given the reaper feature is disabled
    And the search box is empty
    When I type "+is:" into the search box
    Then the filter suggestions should include "deleted"
    And the filter suggestions should not include "reapable"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 46-56
  # Evidence: kahuna/app/views/main.scala.html lines 103

  Scenario: Disabling agency picks removes the agency-pick suggestion
    Given the agency picks feature is disabled
    And the search box is empty
    When I type "+is:" into the search box
    Then the filter suggestions should include "deleted"
    And the filter suggestions should not include "agency-pick"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 46-52, 75-77
  # Evidence: kahuna/app/views/main.scala.html lines 103

  Scenario: Disabling recording downloads as usages removes the download platform suggestion
    Given the record downloads as usages feature is disabled
    And the search box is empty
    When I type "+usages@platform:" into the search box
    Then the filter suggestions should include "print"
    And the filter suggestions should include "digital"
    And the filter suggestions should not include "download"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 277-282
  # Evidence: kahuna/app/views/main.scala.html lines 103

  Scenario: Disabling Photo Sales removes its usage platform suggestion
    Given the send to Photo Sales feature is disabled
    And the search box is empty
    When I type "+usages@platform:" into the search box
    Then the filter suggestions should include "print"
    And the filter suggestions should include "digital"
    And the filter suggestions should not include "Added to Photo Sales"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 277-288
  # Evidence: e2e-tests/steps/image-usages/image-usages.steps.ts lines 239-241

  Scenario: Editing a supplier with a suggestion replaces rather than duplicates the chip
    Given the chip query is "supplier:Reuters"
    When I replace the "supplier" chip value with the prefix "Ronald"
    And I choose "Ronald Grant Archive" from the filter value suggestions
    Then the "supplier" filter chip should have the value "Ronald Grant Archive"
    And there should be exactly 1 filter chips
    And the chip query should be 'supplier:"Ronald Grant Archive"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 157-159, 206-214
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11843-11853, 11998-12010

  Scenario: Negating a chip preserves its value and serializes an exclusion
    Given the chip query is "harbour city:Bristol"
    When I negate the "city" chip
    Then the "city" filter chip should have the value "Bristol"
    And the "city" chip should be excluded
    And the chip query should be "harbour -city:Bristol"
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11810-11823
  # Evidence: kahuna/public/js/components/gr-cql-input/syntax.ts lines 39-56

  Scenario: Removing one chip preserves neighboring text and another chip
    Given the chip query is "harbour city:Bristol keyword:daylight"
    When I remove the "city" chip with its remove control
    Then there should be exactly 1 filter chips
    And the "keyword" filter chip should have the value "daylight"
    And the chip query should be "harbour keyword:daylight"
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11800-11826, 12970-12976

  Scenario: A quoted multi-word expression creates one value and round-trips its meaning
    Given the search box is empty
    When I enter the complete chip query 'description:"Harbour festival at the waterfront"'
    Then the "description" filter chip should have the value "Harbour festival at the waterfront"
    And there should be exactly 1 filter chips
    And the chip query should be 'description:"Harbour festival at the waterfront"'
  # Evidence: kahuna/public/js/components/gr-cql-input/syntax.ts lines 77-92
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 12037-12055

  Scenario: Keyboard navigation into a chip allows deleting a value character without deleting the chip
    Given the chip query is "harbour city:Bristol"
    When I move left into the final chip and press Backspace
    Then the "city" filter chip should have the value "Bristo"
    And there should be exactly 1 filter chips
    And the chip query should be "harbour city:Bristo"
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11973-12015, 12939-12976

  Scenario: Backspace removes a newly created empty chip
    Given the search box is empty
    When I type "+city:" into the search box
    And I press Backspace in the focused empty chip
    Then there should be exactly 0 filter chips
    And the search box should be empty
  # Evidence: kahuna/node_modules/@guardian/cql/dist/lib.js lines 11985-11991, 12939-12976

  Scenario: A search URL restores chip values polarity and adjacent text
    Given I opened a chip search URL for "harbour -city:Bristol keyword:night"
    Then the "city" filter chip should have the value "Bristol"
    And the "city" chip should be excluded
    And the "keyword" filter chip should have the value "night"
    And the chip query should be "harbour -city:Bristol keyword:night"
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70-84
  # Evidence: kahuna/public/js/components/gr-cql-input/syntax.ts lines 24-56

  Scenario: Browser back and forward restore chips and adjacent text
    Given I have chip search history from "harbour -city:Bristol" to "festival city:London"
    When I go back in the browser
    Then the chip query should be "harbour -city:Bristol"
    And the "city" chip should be excluded
    When I go forward in the browser
    Then the chip query should be "festival city:London"
    And the "city" filter chip should have the value "London"
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70-84
  # Evidence: kahuna/public/js/components/gr-cql-input/syntax.ts lines 24-56
