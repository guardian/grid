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
    Examples:
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

  Scenario Outline: Selecting a configured API value completes the corresponding chip
    Given I am choosing a value for the "<Field>" filter
    When I choose "<Value>" from the filter value suggestions
    Then a "<Field>" filter chip should be shown
    And the "<Field>" filter chip should have the value "<Value>"

    # title-format: Select <Field>:<Value> from usage-rights suggestions
    Examples:
      | Field    | Value                          |
      | by       | Example Contracted Photographer |
      | supplier | Ronald Grant Archive           |
      | category | Bylines                        |
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
    Examples:
      | Query                                          | Field            | Value                         |
      | illustrator:Example Contracted Illustrator      | illustrator      | Example Contracted Illustrator |
      | fixtureReference:search-chips-A                 | fixtureReference | search-chips-A                |
      | usages@status:unknown                          | usages@status    | unknown                       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 28-54, 70-84, 115-122
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 134-137, 169-171, 188-199
  # Evidence: e2e-tests/setup/config.ts lines 50-58
