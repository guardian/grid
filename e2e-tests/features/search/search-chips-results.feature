Feature: Combining search filter chips
  Search results must satisfy all included filters and none of the excluded
  filters, including legacy rights categories represented by a modern category

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the image search page

  Scenario: Combining city and keyword filters returns only the image matching both
    Given I am searching only the chip fixtures with all usage rights included
    When I search for images using "city:Bristol keyword:daylight"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | A       |
  # Evidence: kahuna/public/js/search/query.html lines 13-15
  # Evidence: kahuna/public/js/search/results.html lines 23-29, 158-206
  # Evidence: kahuna/public/js/search/results.js lines 618-622
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114, 150-198, 209-211
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 90-119

  Scenario: Excluding a keyword retains the positive city constraint
    Given I am searching only the chip fixtures with all usage rights included
    When I search for images using "city:Bristol -keyword:night"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | A       |
  # Evidence: kahuna/public/js/search/query.html lines 13-15
  # Evidence: kahuna/public/js/search/results.html lines 23-29, 158-206
  # Evidence: kahuna/public/js/search/results.js lines 618-622
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 20-26
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 150-198, 209-211
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 90-143

  Scenario: Searching the pay-to-use category includes legacy chargeable images
    Given I am searching only the chip fixtures with all usage rights included
    When I search for images using "category:pay-to-use"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | C       |
      | D       |
  # Evidence: kahuna/public/js/search/query.html lines 13-15
  # Evidence: kahuna/public/js/search/results.html lines 23-29, 158-206
  # Evidence: kahuna/public/js/search/results.js lines 618-622
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 42-54, 99-102, 209-211
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 194-228
  # Evidence: e2e-tests/setup/config.ts lines 163-177
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 131-142

  Scenario Outline: Supplemental metadata values return the matching fixture rather than the near-miss
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Search <Query> within <Fixtures> returns <Match>

    Examples: Search <Query> within <Fixtures> returns <Match>
      | Fixtures | Query                                          | Match |
      | A,B,M    | fileType:tiff                                  | M     |
      | A,B,M    | fileType:tif                                   | M     |
      | A,B,M    | subject:weather                                | M     |
      | E,R,S    | by:"Example Contracted Photographer"           | R     |
      | E,R,S    | category:contract-photographer                 | R     |
      | E,R,S    | category:commissioned-photographer             | S     |
      | E,F,T,U  | illustrator:"Example Contracted Illustrator"   | F     |
      | E,F,T,U  | illustrator:"Example Staff Illustrator"        | T     |
      | E,F,T,U  | illustrator:"Example Commissioned Illustrator" | U     |
      | N,P,Q    | category:Bylines                               | Q     |
      | I,N      | category:commissioned-agency supplier:Alamy    | N     |
      | I,O      | title:"Search chips edited title O"            | O     |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70-84, 115-122
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114, 209-211
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 150-168, 195-201
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 172-180, 209-261

  Scenario Outline: Each persistence reason includes its positive fixture and excludes the empty baseline
    Given I am searching chip fixtures "<Match>,I" with all usage rights included
    When I search for images using "persisted:<Reason>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Persistence reason <Reason> returns <Match> rather than I

    @known-defect
    Examples: Persistence reason <Reason> returns <Match> rather than I
      | Reason                 | Match |
      | persistence-identifier | M     |

    Examples: Persistence reason <Reason> returns <Match> rather than I
      | Reason                 | Match |
      | exports                | B     |
      | usages                 | V     |
      | archived               | E     |
      | photographer-category  | E     |
      | illustrator-category   | F     |
      | commissioned-agency    | N     |
      | leases                 | F     |
      | persisted-collection   | E     |
      | photoshoot             | E     |
      | labeled                | E     |
      | edited                 | O     |
      # Known backend defect: the identifier query requires every configured identifier, not any one.
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 87-91, 140-148
  # Evidence: media-api/app/lib/ImagePersistenceReasons.scala lines 10-26, 34-149
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/PersistedQueries.scala lines 28
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala lines 51-52
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 118-203, 209-236, 262-278

  Scenario: Modern PR category search includes a legacy commissioned-agency fixture
    Given I am searching chip fixtures "N,P,Q" with all usage rights included
    When I search for images using "category:pr-and-third-party"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | N       |
      | P       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 42-54, 99-102
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 228-253, 296-308
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 226-238

  Scenario Outline: Supplemental usages match the requested platform status or reference on the same usage
    Given I am searching chip fixtures "G,H,I,V" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | V       |
    # title-format: Usage query <Query> returns V rather than G H or I

    Examples: Usage query <Query> returns V rather than G H or I
      | Query                                                                                 |
      | usages@platform:download usages@status:downloaded                                     |
      | usages@platform:"Added to Photo Sales" usages@status:syndicated                       |
      | usages@status:derivative                                                              |
      | usages@status:failed                                                                  |
      | usages@status:unknown                                                                 |
      | usages@status:removed usages@reference:"Search Chips Harbour Story"                   |
      | usages@status:removed usages@reference:"https://search-chips.invalid/stories/harbour" |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 105-111, 165-198
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 144-168
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 262-278

  Scenario Outline: Configured aliases use their configured field and existence behavior
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Alias query <Query> within <Fixtures> returns <Match>

    Examples: Alias query <Query> within <Fixtures> returns <Match>
      | Fixtures | Query                           | Match |
      | A,E,I    | fixtureSubject:sport            | E     |
      | A,I      | fixtureReference:search-chips-A | A     |
      | A,I      | fixtureHasPerson:true           | A     |
      | A,I      | fixtureHasPerson:false          | I     |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 24-40, 92-104
  # Evidence: e2e-tests/setup/config.ts lines 39-66
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 108-117, 289-292

  Scenario Outline: Supplemental suppliers remain searchable as complete names
    Given I am searching chip fixtures "<Match>,I" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Supplier <Supplier> returns <Match> rather than I

    Examples: Supplier <Supplier> returns <Match> rather than I
      | Supplier                | Query                              | Match                         |
      | AAP                     | supplier:AAP                       | M                             |
      | Alamy                   | supplier:Alamy                     | N                             |
      | Allstar Picture Library | supplier:"Allstar Picture Library" | O                             |
      | EPA                     | supplier:EPA                       | W                             |
      | Getty Images            | supplier:"Getty Images"            | supplier-getty-images         |
      | PA                      | supplier:PA                        | supplier-pa                   |
      | Rex Features            | supplier:"Rex Features"            | supplier-rex-features         |
      | Ronald Grant Archive    | supplier:"Ronald Grant Archive"    | supplier-ronald-grant-archive |
      | Action Images           | supplier:"Action Images"           | supplier-action-images        |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 10-17, 209-236, 279-286

  Scenario: Agency-pick search uses the configured agency-pick terms
    Given I am searching chip fixtures "M,W" with all usage rights included
    When I search for images using "is:agency-pick"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | W       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/IsQueryFilter.scala lines 28-39
  # Evidence: media-api/app/lib/MediaApiConfig.scala lines 92-99
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 279-283

  @known-defect
  Scenario: Reapable search excludes an old image with a persistence identifier
    # Known backend defect: the same multi-identifier existence query currently allows M through.
    Given I am searching chip fixtures "M,W" with all usage rights included
    When I search for images using "is:reapable"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | W       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ReapableEligibility.scala lines 20-42
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 209-225, 279-283

  Scenario Outline: Quota predicates distinguish seeded over-quota and under-quota suppliers
    Given I am searching chip fixtures "M,supplier-rex-features" with all usage rights included
    And the seeded supplier quota report is available
    When I search for images using "<Query>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Quota query <Query> returns <Match>

    Examples: Quota query <Query> returns <Match>
      | Query           | Match                 |
      | is:under-quota  | supplier-rex-features |
      | -is:under-quota | M                     |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/IsQueryFilter.scala lines 28-39, 61-66
  # Evidence: media-api/app/controllers/UsageController.scala lines 119-135
  # Evidence: media-api/app/lib/UsageStore.scala lines 47-63, 154-157
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 209-225, 284-286
  # Evidence: dev/config/rcs-quota.json lines 1-14
  # Evidence: dev/config/usages.eml lines 23-32

  Scenario Outline: Core metadata combinations retain their positive constraints
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Core combination <Query> within <Fixtures> returns <Matches>

    Examples: Core combination <Query> within <Fixtures> returns <Matches>
      | Fixtures | Query                                                     | Matches |
      | A,B      | fileType:png has:crops                                    | B       |
      | A,B      | fileType:jpeg -has:crops                                  | A       |
      | A,B,C,D  | in:Somerset keyword:daylight                              | A       |
      | A,B,C,D  | city:Somerset keyword:daylight                            | none    |
      | A,B,C,D  | location:Harbourside keyword:night                        | B       |
      | E,F      | is:GNM-owned-photo                                        | E       |
      | E,F      | is:GNM-owned-illustration                                 | F       |
      | E,F      | is:GNM-owned                                              | E,F     |
      | F,I      | leasedBy:grid-e2e-account@guardian.co.uk persisted:leases | F       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 150-168, 195-201
  # Evidence: media-api/app/lib/elasticsearch/IsQueryFilter.scala lines 28-58
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-148
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 108-197

  Scenario: Label collection and photoshoot constraints intersect with archive persistence
    Given I am searching chip fixtures "E,I" with all usage rights included
    When I search for images using '#search-chips-featured ~"search-chips" photoshoot:"Search Chips Harbour Shoot" persisted:archived'
    Then the search results should contain exactly chip fixtures "E"
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 88-100, 150-168
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 87-148
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 151-171, 289-292

  Scenario: Platform and status filters must match the same usage
    Given I am searching chip fixtures "G,H" with all usage rights included
    When I search for images using "usages@platform:print usages@status:published"
    Then the search results should contain exactly chip fixtures "H"
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 165-198
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 195-196

  Scenario Outline: Replaced defaults and explicit status filters apply to the whole image
    Given I am searching chip fixtures "H,J" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Usage status combination <Query> returns <Matches>

    Examples: Usage status combination <Query> returns <Matches>
      | Query                                           | Matches |
      | usages@status:published                         | H       |
      | usages@status:replaced                          | J       |
      | usages@status:published -usages@status:replaced | H       |
      | usages@status:published usages@status:replaced  | none    |
      | usages@status:replaced -usages@status:published | none    |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/Parser.scala lines 5-29
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 165-198
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 196-203

  Scenario Outline: Date constraints distinguish inclusive usage boundaries and missing capture dates
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Date combination <Query> returns <Matches>

    Examples: Date combination <Query> returns <Matches>
      | Fixtures | Query                                                                     | Matches |
      | H,J      | usages@>added:2024-06-15 usages@<added:2024-06-15 | H       |
      | H,I      | date:2024-06-15 has:dateTaken                                             | H       |
      | H,I      | date:2024-06-15 -has:dateTaken                                            | I       |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 61-78, 203-225
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 112-119, 165-198
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 7, 195-203, 289-292

  Scenario Outline: Deleted images are explicitly filtered by the requested uploader
    Given I am searching chip fixtures "K,L" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Deleted image query <Query> returns <Matches>

    Examples: Deleted image query <Query> returns <Matches>
      | Query                                                     | Matches |
      | uploader:grid-e2e-account@guardian.co.uk                    | none    |
      | is:deleted uploader:grid-e2e-account@guardian.co.uk         | K       |
      | is:deleted uploader:search-chips-other@guardian.co.uk      | L       |
  # Evidence: media-api/app/lib/querysyntax/Parser.scala lines 5-29, 42-56
  # Evidence: media-api/app/controllers/MediaApi.scala lines 48-54
  # Evidence: e2e-tests/fixtures/permissions/permissions.json lines 59-73
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 204-208
