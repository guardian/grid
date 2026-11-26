Feature: Combining search filter chips
  Search results must satisfy all included filters and none of the excluded
  filters, including legacy rights categories represented by a modern category

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario Outline: Supplemental metadata values return the matching fixture rather than the near-miss
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Search <Query> within <Fixtures> returns <Match>

    Examples: Search <Query> within <Fixtures> returns <Match>
      | Fixtures                                                                                            | Query                                          | Match                        |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Contracted Illustrator"   | contract-illustration-leased |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Staff Illustrator"        | staff-illustrator            |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Commissioned Illustrator" | commissioned-illustrator     |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70-84, 115-122
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114, 209-211
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 150-168, 195-201
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 245-251
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 106-149, 156-163

  Scenario Outline: Each persistence reason includes its positive fixture and excludes the empty baseline
    Given I am searching chip fixtures "<Match>,missing-metadata-unpersisted" with all usage rights included
    When I search for images using "persisted:<Reason>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Persistence reason <Reason> returns <Match> rather than missing-metadata-unpersisted

    Examples: Persistence reason <Reason> returns <Match> rather than missing-metadata-unpersisted
      | Reason                 | Match                                |
      | usages                 | assorted-usages-with-reference       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 87-91, 140-148
  # Evidence: media-api/app/lib/ImagePersistenceReasons.scala lines 10-26, 34-149
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/PersistedQueries.scala lines 28
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala lines 51-52
  # Evidence: kahuna/public/js/preview/image.js lines 67
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 150, 164-189

  Scenario Outline: Configured aliases use their configured field and existence behavior
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Alias query <Query> within <Fixtures> returns <Match>

    Examples: Alias query <Query> within <Fixtures> returns <Match>
      | Fixtures                                                                       | Query                                               | Match                        |
      | harbour-daylight-jpeg,missing-metadata-unpersisted                             | fixtureHasPerson:true                               | harbour-daylight-jpeg        |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 24-40, 92-104
  # Evidence: e2e-tests/setup/config.ts lines 39-66
  # Evidence: kahuna/public/js/services/graphic-image-blur.js lines 49
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 91-105, 150, 183-189

  Scenario: Label collection and photoshoot constraints intersect with archive persistence
    Given I am searching chip fixtures "staff-photo-multi-persisted,missing-metadata-unpersisted" with all usage rights included
    When I search for images using '#search-chips-featured ~"search-chips" photoshoot:"Search Chips Harbour Shoot" persisted:archived'
    Then the search results should contain exactly chip fixtures "staff-photo-multi-persisted"
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 88-100, 150-168
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 87-148
  # Evidence: kahuna/public/js/search/structured-query/syntax.ts lines 96-97, 109
  # Evidence: kahuna/public/js/search-query/query-syntax.js lines 1-37
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 106-126, 150, 183-189

  Scenario Outline: Deleted images are explicitly filtered by the requested uploader
    Given I am searching chip fixtures "deleted-own-upload,deleted-other-upload" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Deleted image query <Query> returns <Matches>

    Examples: Deleted image query <Query> returns <Matches>
      | Query                                                 | Matches              |
      | is:deleted uploader:grid-e2e-account@guardian.co.uk   | deleted-own-upload   |
  # Evidence: media-api/app/lib/querysyntax/Parser.scala lines 5-29, 42-56
  # Evidence: media-api/app/controllers/MediaApi.scala lines 48-54
  # Evidence: e2e-tests/fixtures/permissions/permissions.json lines 59-73
  # Evidence: kahuna/public/js/services/telemetry.ts lines 54
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 151-155
