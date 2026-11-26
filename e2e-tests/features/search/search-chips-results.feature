Feature: Combining search filter chips
  Search results must satisfy all included filters and none of the excluded
  filters, including legacy rights categories represented by a modern category

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  @serverside @todo
  Scenario: Searching the pay-to-use category includes legacy chargeable images
    Given I am searching only the chip fixtures with all usage rights included
    When I search for images using "category:pay-to-use"
    Then the search results should contain exactly these chip fixtures:
      | Fixture                   |
      | pay-to-use-london         |
      | legacy-chargeable-cardiff |
  # Evidence: kahuna/public/js/search/query.html lines 13-15
  # Evidence: kahuna/public/js/search/results.html lines 23-29, 158-206
  # Evidence: kahuna/public/js/search/results.js lines 618-622
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 42-54, 99-102, 209-211
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 194-228
  # Evidence: e2e-tests/setup/config.ts lines 225-235
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1275-1292

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

    @serverside @todo
    Examples: Persistence reason <Reason> returns <Match> rather than missing-metadata-unpersisted
      | Reason                 | Match                                |
      | exports                | harbour-night-cropped-png            |
      | archived               | staff-photo-multi-persisted          |
      | photographer-category  | staff-photo-multi-persisted          |
      | illustrator-category   | contract-illustration-leased         |
      | commissioned-agency    | legacy-commissioned-agency           |
      | leases                 | contract-illustration-leased         |
      | persisted-collection   | staff-photo-multi-persisted          |
      | photoshoot             | staff-photo-multi-persisted          |
      | labeled                | staff-photo-multi-persisted          |
      | edited                 | edited-title                         |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 87-91, 140-148
  # Evidence: media-api/app/lib/ImagePersistenceReasons.scala lines 10-26, 34-149
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/PersistedQueries.scala lines 28
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala lines 51-52
  # Evidence: kahuna/public/js/preview/image.js lines 67
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 150, 164-189
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1247-1273

  @serverside @todo
  Scenario Outline: Modern category search includes only the legacy categories it replaces
    Given I am searching chip fixtures "legacy-commissioned-agency,pr-and-third-party,bylines-rights" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Category query <Query> returns <Matches>

    Examples: Category query <Query> returns <Matches>
      | Query                          | Matches                                   |
      | category:pr-and-third-party    | pr-and-third-party                        |
      | category:publisher-photography | legacy-commissioned-agency,bylines-rights |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 42-54, 99-102
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 228-255, 686-713
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1275-1292

  @serverside @todo
  Scenario Outline: Supplemental usages match the requested platform status or reference on the same usage
    Given I am searching chip fixtures "split-print-and-published-usages,print-published-at-midnight,missing-metadata-unpersisted,assorted-usages-with-reference" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture                        |
      | assorted-usages-with-reference |
    # title-format: Usage query <Query> returns only assorted-usages-with-reference

    Examples: Usage query <Query> returns only assorted-usages-with-reference
      | Query                                                                                 |
      | usages@platform:"Added to Photo Sales" usages@status:syndicated                       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 105-111, 165-198
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 144-168
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1346-1356

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

    @serverside @todo
    Examples: Alias query <Query> within <Fixtures> returns <Match>
      | Fixtures                                                                       | Query                                               | Match                        |
      | harbour-daylight-jpeg,staff-photo-multi-persisted,missing-metadata-unpersisted | fixtureSubject:sport                                | staff-photo-multi-persisted  |
      | harbour-daylight-jpeg,missing-metadata-unpersisted                             | fixtureReference:search-chips-harbour-daylight-jpeg | harbour-daylight-jpeg        |
      | harbour-daylight-jpeg,missing-metadata-unpersisted                             | fixtureHasPerson:false                              | missing-metadata-unpersisted |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 24-40, 92-104
  # Evidence: e2e-tests/setup/config.ts lines 39-66
  # Evidence: kahuna/public/js/services/graphic-image-blur.js lines 49
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 91-105, 150, 183-189
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1307-1329

  @serverside @todo
  Scenario Outline: Supplemental suppliers remain searchable as complete names
    Given I am searching chip fixtures "<Match>,missing-metadata-unpersisted" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Supplier <Supplier> returns <Match> rather than missing-metadata-unpersisted

    Examples: Supplier <Supplier> returns <Match> rather than missing-metadata-unpersisted
      | Supplier                | Query                              | Match                         |
      | AAP                     | supplier:AAP                       | tiff-identifier-over-quota    |
      | Getty Images            | supplier:"Getty Images"            | supplier-getty-images         |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1375-1389

  @serverside @todo
  Scenario: Agency-pick search uses the configured agency-pick terms
    Given I am searching chip fixtures "tiff-identifier-over-quota,old-agency-pick" with all usage rights included
    When I search for images using "is:agency-pick"
    Then the search results should contain exactly these chip fixtures:
      | Fixture         |
      | old-agency-pick |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/IsQueryFilter.scala lines 28-39
  # Evidence: media-api/app/lib/MediaApiConfig.scala lines 113-119
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1294-1305

  @serverside @todo
  Scenario Outline: Core metadata combinations retain their positive constraints
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Core combination <Query> within <Fixtures> returns <Matches>

    Examples: Core combination <Query> within <Fixtures> returns <Matches>
      | Fixtures                                                  | Query                                                     | Matches                      |
      | contract-illustration-leased,missing-metadata-unpersisted | leasedBy:grid-e2e-account@guardian.co.uk persisted:leases | contract-illustration-leased |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-148
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1358-1373

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

    @serverside @todo
    Examples: Deleted image query <Query> returns <Matches>
      | Query                                                 | Matches              |
      | uploader:grid-e2e-account@guardian.co.uk              | none                 |
      | is:deleted uploader:search-chips-other@guardian.co.uk | deleted-other-upload |
  # Evidence: media-api/app/lib/querysyntax/Parser.scala lines 5-29, 42-56
  # Evidence: media-api/app/controllers/MediaApi.scala lines 48-54
  # Evidence: e2e-tests/fixtures/permissions/permissions.json lines 59-73
  # Evidence: kahuna/public/js/services/telemetry.ts lines 54
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 151-155
  # Evidence: media-api/test/lib/elasticsearch/ElasticSearchTest.scala lines 1331-1344
