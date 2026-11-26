Feature: Combining search filter chips
  Search results must contain exactly the images that satisfy every chip

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario Outline: Chip searches return only the matching fixtures
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: <Query> within <Fixtures> returns <Matches>

    Examples: <Query> within <Fixtures> returns <Matches>
      | Fixtures                                                                                            | Query                                                                                                  | Matches                        |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Contracted Illustrator"                                                           | contract-illustration-leased   |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Staff Illustrator"                                                                | staff-illustrator              |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Commissioned Illustrator"                                                         | commissioned-illustrator       |
      | assorted-usages-with-reference,missing-metadata-unpersisted                                         | persisted:usages                                                                                       | assorted-usages-with-reference |
      | harbour-daylight-jpeg,missing-metadata-unpersisted                                                  | fixtureHasPerson:true                                                                                  | harbour-daylight-jpeg          |
      | staff-photo-multi-persisted,missing-metadata-unpersisted                                            | #search-chips-featured ~"search-chips" photoshoot:"Search Chips Harbour Shoot" persisted:archived      | staff-photo-multi-persisted    |
      | deleted-own-upload,deleted-other-upload                                                             | is:deleted uploader:grid-e2e-account@guardian.co.uk                                                    | deleted-own-upload             |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70-84, 115-122
  # Evidence: kahuna/public/js/search/structured-query/query-suggestions.ts lines 245-251
  # Evidence: kahuna/public/js/search/structured-query/syntax.ts lines 96-97, 109
  # Evidence: kahuna/public/js/search-query/query-syntax.js lines 1-37
  # Evidence: kahuna/public/js/services/graphic-image-blur.js lines 49
  # Evidence: kahuna/public/js/preview/image.js lines 67
  # Evidence: kahuna/public/js/services/telemetry.ts lines 54
  # Evidence: e2e-tests/setup/config.ts lines 39-66
  # Evidence: e2e-tests/fixtures/permissions/permissions.json lines 59-73
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 91-189
