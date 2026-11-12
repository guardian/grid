Feature: Creating search filter chips
  Search filters can be entered manually or completed from suggestions for
  field names and values

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: Typing a city filter creates a chip without choosing a suggestion
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

  Scenario: Selecting a local file type suggestion completes the chip value
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
      | usages@platform  | Added to Photo Sales   |
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

  @wiremock
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
      | category | Bylines                         |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 113-120, 157-159, 216-251
  # Evidence: dev/script/generate-config/service-config.js lines 54-82

  Scenario Outline: Manually entered supplemental values do not require choosing a suggestion
    Given the search box is empty
    When I type '<Query>' into the search box
    Then a "<Field>" filter chip should be shown
    And the "<Field>" filter chip should have the value "<Value>"
    # title-format: Enter <Field>:<Value> manually

    Examples: Enter <Field>:<Value> manually
      | Query                                      | Field            | Value                          |
      | illustrator:Example Contracted Illustrator | illustrator      | Example Contracted Illustrator |
      | fixtureReference:search-chips-A            | fixtureReference | search-chips-A                 |
      | usages@status:unknown                      | usages@status    | unknown                        |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54, 70-84, 115-122
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 134-137, 169-171, 188-199
  # Evidence: e2e-tests/setup/config.ts lines 50-58

  Scenario: A typed credit prefix retrieves a seeded completion that can be selected
    Given I am choosing a credit value starting with "Search Chips Shared"
    When I choose "Search Chips Shared Credit" from the filter value suggestions
    Then the "credit" filter chip should have the value "Search Chips Shared Credit"
    And the chip query should be 'credit:"Search Chips Shared Credit"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 124-127, 264-268
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 98-117

  Scenario: A typed photoshoot prefix retrieves a seeded completion that can be selected
    Given I am choosing a photoshoot value starting with "Search Chips Harbour"
    When I choose "Search Chips Harbour Shoot" from the filter value suggestions
    Then the "photoshoot" filter chip should have the value "Search Chips Harbour Shoot"
    And the chip query should be 'photoshoot:"Search Chips Harbour Shoot"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 169-175, 266-270
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 151-171

  Scenario: Disabling optional search features removes the persisted field
    Given optional search suggestion features are disabled
    When I type "+per" into the search box
    Then the filter suggestions should include "person"
    And the filter suggestions should not include "persisted"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 54-72, 164-168
  # Evidence: kahuna/app/views/main.scala.html lines 103

  Scenario: Disabling optional search features removes conditional is suggestions
    Given optional search suggestion features are disabled
    When I type "+is:" into the search box
    Then the filter suggestions should include "deleted"
    And the filter suggestions should not include "reapable"
    And the filter suggestions should not include "agency-pick"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 46-77
  # Evidence: kahuna/app/views/main.scala.html lines 103

  Scenario: Disabling optional usage features retains only print and digital suggestions
    Given optional search suggestion features are disabled
    When I type "+usages@platform:" into the search box
    Then the filter suggestions should include "print"
    And the filter suggestions should include "digital"
    And the filter suggestions should not include "download"
    And the filter suggestions should not include "Added to Photo Sales"
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 277-288
  # Evidence: kahuna/app/views/main.scala.html lines 103

  Scenario: A credit without a completion remains a valid manually entered chip value
    Given the search box is empty
    When I type "credit:Search Chips Manual Credit" into the search box
    Then the "credit" filter chip should have the value "Search Chips Manual Credit"
    And the chip query should be 'credit:"Search Chips Manual Credit"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 124-127, 264-268
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54, 115-122

  @wiremock
  Scenario: Editing a photographer with a suggestion replaces rather than duplicates the chip
    Given the chip query is 'by:"Example External Photographer"'
    When I replace the "by" chip value with the prefix "Example"
    And I choose "Example Internal Photographer" from the filter value suggestions
    Then the "by" filter chip should have the value "Example Internal Photographer"
    And there should be exactly 1 filter chips
    And the chip query should be 'by:"Example Internal Photographer"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 113-117, 236-251
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

  @wiremock
  Scenario: The hash shortcut creates a label chip using a WireMock label suggestion
    Given the search box is empty
    When I type "#search-chips" into the search box
    And I choose "search-chips-featured" from the filter value suggestions
    Then the "label" filter chip should have the value "search-chips-featured"
    And the chip query should be "#search-chips-featured" with editor form "label:search-chips-featured"
  # Evidence: kahuna/public/js/components/gr-cql-input/syntax.ts lines 14-20
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 141-143, 276-280
  # Evidence: kahuna/public/js/services/api/media-api.js lines 115-116
  # Evidence: media-api/app/controllers/MediaApi.scala lines 135-160

  @wiremock
  Scenario: Selecting a configured illustrator suggestion completes the chip
    Given I am choosing a value for the "illustrator" filter
    When I choose "Example Contracted Illustrator" from the filter value suggestions
    Then the "illustrator" filter chip should have the value "Example Contracted Illustrator"
    And there should be exactly 1 filter chips
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 134-137, 254-262
  # Evidence: dev/script/generate-config/service-config.js lines 78-82

  @wiremock
  Scenario: A typed source prefix retrieves a WireMock suggestion that can be selected
    Given I am choosing a source value starting with "Search Chips"
    When I choose "Search Chips Wire" from the filter value suggestions
    Then the "source" filter chip should have the value "Search Chips Wire"
    And the chip query should be 'source:"Search Chips Wire"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 146-149, 260-264
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 55
  # Evidence: e2e-tests/fixtures/suggestions/suggestion-wiremock.ts lines 25-105

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

  Scenario: An unavailable source suggestion lookup does not prevent manual chip entry
    Given the search box is empty
    When I request source suggestions for "Search Chips"
    And I enter the complete chip query 'source:"Search Chips Wire"'
    Then the "source" filter chip should have the value "Search Chips Wire"
    And the chip query should be 'source:"Search Chips Wire"'
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 147-149, 270-274
  # Evidence: kahuna/public/js/services/api/media-api.js lines 107-108
  # Evidence: media-api/conf/routes lines 33-34

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
