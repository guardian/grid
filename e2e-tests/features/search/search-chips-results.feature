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
      | Fixture               |
      | harbour-daylight-jpeg |
  # Evidence: kahuna/public/js/search/query.html lines 13-15
  # Evidence: kahuna/public/js/search/results.html lines 23-29, 158-206
  # Evidence: kahuna/public/js/search/results.js lines 618-622
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114, 150-198, 209-211
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 120-149

  Scenario: Excluding a keyword retains the positive city constraint
    Given I am searching only the chip fixtures with all usage rights included
    When I search for images using "city:Bristol -keyword:night"
    Then the search results should contain exactly these chip fixtures:
      | Fixture               |
      | harbour-daylight-jpeg |
  # Evidence: kahuna/public/js/search/query.html lines 13-15
  # Evidence: kahuna/public/js/search/results.html lines 23-29, 158-206
  # Evidence: kahuna/public/js/search/results.js lines 618-622
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 20-26
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 150-198, 209-211
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 120-173

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
  # Evidence: e2e-tests/setup/config.ts lines 163-177
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 161-172

  Scenario Outline: Supplemental metadata values return the matching fixture rather than the near-miss
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Search <Query> within <Fixtures> returns <Match>

    Examples: Search <Query> within <Fixtures> returns <Match>
      | Fixtures                                                                                            | Query                                          | Match                        |
      | harbour-daylight-jpeg,harbour-night-cropped-png,tiff-identifier-over-quota                          | fileType:tiff                                  | tiff-identifier-over-quota   |
      | harbour-daylight-jpeg,harbour-night-cropped-png,tiff-identifier-over-quota                          | fileType:tif                                   | tiff-identifier-over-quota   |
      | harbour-daylight-jpeg,harbour-night-cropped-png,tiff-identifier-over-quota                          | subject:weather                                | tiff-identifier-over-quota   |
      | staff-photo-multi-persisted,contract-photographer,commissioned-photographer                         | by:"Example Contracted Photographer"           | contract-photographer        |
      | staff-photo-multi-persisted,contract-photographer,commissioned-photographer                         | category:contract-photographer                 | contract-photographer        |
      | staff-photo-multi-persisted,contract-photographer,commissioned-photographer                         | category:commissioned-photographer             | commissioned-photographer    |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Contracted Illustrator"   | contract-illustration-leased |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Staff Illustrator"        | staff-illustrator            |
      | staff-photo-multi-persisted,contract-illustration-leased,staff-illustrator,commissioned-illustrator | illustrator:"Example Commissioned Illustrator" | commissioned-illustrator     |
      | legacy-commissioned-agency,pr-and-third-party,bylines-rights                                        | category:Bylines                               | bylines-rights               |
      | missing-metadata-unpersisted,legacy-commissioned-agency                                             | category:commissioned-agency supplier:Alamy    | legacy-commissioned-agency   |
      | missing-metadata-unpersisted,edited-title                                                           | title:"Search chips edited title"              | edited-title                 |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: kahuna/public/js/components/gr-cql-input/gr-cql-input.ts lines 70-84, 115-122
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114, 209-211
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 150-168, 195-201
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 202-210, 243-295

  Scenario Outline: Each persistence reason includes its positive fixture and excludes the empty baseline
    Given I am searching chip fixtures "<Match>,missing-metadata-unpersisted" with all usage rights included
    When I search for images using "persisted:<Reason>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Persistence reason <Reason> returns <Match> rather than missing-metadata-unpersisted

    Examples: Persistence reason <Reason> returns <Match> rather than missing-metadata-unpersisted
      | Reason                 | Match                                |
      | persistence-identifier | tiff-identifier-over-quota           |
      | persistence-identifier | derivative-identifier                |
      | persistence-identifier | replaces-and-persistence-identifiers |
      | exports                | harbour-night-cropped-png            |
      | usages                 | assorted-usages-with-reference       |
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
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 148-237, 243-270, 296-312

  Scenario: Modern PR category search includes a legacy commissioned-agency fixture
    Given I am searching chip fixtures "legacy-commissioned-agency,pr-and-third-party,bylines-rights" with all usage rights included
    When I search for images using "category:pr-and-third-party"
    Then the search results should contain exactly these chip fixtures:
      | Fixture                    |
      | legacy-commissioned-agency |
      | pr-and-third-party         |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 42-54, 99-102
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 228-253, 296-308
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 260-272

  Scenario Outline: Supplemental usages match the requested platform status or reference on the same usage
    Given I am searching chip fixtures "split-print-and-published-usages,print-published-at-midnight,missing-metadata-unpersisted,assorted-usages-with-reference" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly these chip fixtures:
      | Fixture                        |
      | assorted-usages-with-reference |
    # title-format: Usage query <Query> returns only assorted-usages-with-reference

    Examples: Usage query <Query> returns only assorted-usages-with-reference
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
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 296-312

  Scenario Outline: Configured aliases use their configured field and existence behavior
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Alias query <Query> within <Fixtures> returns <Match>

    Examples: Alias query <Query> within <Fixtures> returns <Match>
      | Fixtures                                                                       | Query                                               | Match                        |
      | harbour-daylight-jpeg,staff-photo-multi-persisted,missing-metadata-unpersisted | fixtureSubject:sport                                | staff-photo-multi-persisted  |
      | harbour-daylight-jpeg,missing-metadata-unpersisted                             | fixtureReference:search-chips-harbour-daylight-jpeg | harbour-daylight-jpeg        |
      | harbour-daylight-jpeg,missing-metadata-unpersisted                             | fixtureHasPerson:true                               | harbour-daylight-jpeg        |
      | harbour-daylight-jpeg,missing-metadata-unpersisted                             | fixtureHasPerson:false                              | missing-metadata-unpersisted |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 24-40, 92-104
  # Evidence: e2e-tests/setup/config.ts lines 39-66
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 138-147, 323-329

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
      | Alamy                   | supplier:Alamy                     | legacy-commissioned-agency    |
      | Allstar Picture Library | supplier:"Allstar Picture Library" | edited-title                  |
      | EPA                     | supplier:EPA                       | old-agency-pick               |
      | Getty Images            | supplier:"Getty Images"            | supplier-getty-images         |
      | PA                      | supplier:PA                        | supplier-pa                   |
      | Rex Features            | supplier:"Rex Features"            | supplier-rex-features         |
      | Ronald Grant Archive    | supplier:"Ronald Grant Archive"    | supplier-ronald-grant-archive |
      | Action Images           | supplier:"Action Images"           | supplier-action-images        |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-114
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 11-51, 243-270, 313-320

  Scenario: Agency-pick search uses the configured agency-pick terms
    Given I am searching chip fixtures "tiff-identifier-over-quota,old-agency-pick" with all usage rights included
    When I search for images using "is:agency-pick"
    Then the search results should contain exactly these chip fixtures:
      | Fixture         |
      | old-agency-pick |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/IsQueryFilter.scala lines 28-39
  # Evidence: media-api/app/lib/MediaApiConfig.scala lines 92-99
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 313-317

  Scenario: Reapable search excludes an old image with a persistence identifier
    Given I am searching chip fixtures "tiff-identifier-over-quota,old-agency-pick" with all usage rights included
    When I search for images using "is:reapable"
    Then the search results should contain exactly these chip fixtures:
      | Fixture         |
      | old-agency-pick |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ReapableEligibility.scala lines 20-42
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 243-259, 313-317

  Scenario Outline: Quota predicates distinguish seeded over-quota and under-quota suppliers
    Given I am searching chip fixtures "tiff-identifier-over-quota,supplier-rex-features" with all usage rights included
    And the seeded supplier quota report is available
    When I search for images using "<Query>"
    Then the search results should contain exactly these chip fixtures:
      | Fixture |
      | <Match> |
    # title-format: Quota query <Query> returns <Match>

    Examples: Quota query <Query> returns <Match>
      | Query           | Match                      |
      | is:under-quota  | supplier-rex-features      |
      | -is:under-quota | tiff-identifier-over-quota |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/IsQueryFilter.scala lines 28-39, 61-66
  # Evidence: media-api/app/controllers/UsageController.scala lines 119-135
  # Evidence: media-api/app/lib/UsageStore.scala lines 47-63, 154-157
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 243-259, 318-320
  # Evidence: dev/config/rcs-quota.json lines 1-14
  # Evidence: dev/config/usages.eml lines 23-32

  Scenario Outline: Core metadata combinations retain their positive constraints
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Core combination <Query> within <Fixtures> returns <Matches>

    Examples: Core combination <Query> within <Fixtures> returns <Matches>
      | Fixtures                                                                                    | Query                                                     | Matches                                                  |
      | harbour-daylight-jpeg,harbour-night-cropped-png                                             | fileType:png has:crops                                    | harbour-night-cropped-png                                |
      | harbour-daylight-jpeg,harbour-night-cropped-png                                             | fileType:jpeg -has:crops                                  | harbour-daylight-jpeg                                    |
      | harbour-daylight-jpeg,harbour-night-cropped-png,pay-to-use-london,legacy-chargeable-cardiff | in:Somerset keyword:daylight                              | harbour-daylight-jpeg                                    |
      | harbour-daylight-jpeg,harbour-night-cropped-png,pay-to-use-london,legacy-chargeable-cardiff | city:Somerset keyword:daylight                            | none                                                     |
      | harbour-daylight-jpeg,harbour-night-cropped-png,pay-to-use-london,legacy-chargeable-cardiff | location:Harbourside keyword:night                        | harbour-night-cropped-png                                |
      | staff-photo-multi-persisted,contract-illustration-leased                                    | is:GNM-owned-photo                                        | staff-photo-multi-persisted                              |
      | staff-photo-multi-persisted,contract-illustration-leased                                    | is:GNM-owned-illustration                                 | contract-illustration-leased                             |
      | staff-photo-multi-persisted,contract-illustration-leased                                    | is:GNM-owned                                              | staff-photo-multi-persisted,contract-illustration-leased |
      | contract-illustration-leased,missing-metadata-unpersisted                                   | leasedBy:grid-e2e-account@guardian.co.uk persisted:leases | contract-illustration-leased                             |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 150-168, 195-201
  # Evidence: media-api/app/lib/elasticsearch/IsQueryFilter.scala lines 28-58
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 92-148
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 138-231

  Scenario: Label collection and photoshoot constraints intersect with archive persistence
    Given I am searching chip fixtures "staff-photo-multi-persisted,missing-metadata-unpersisted" with all usage rights included
    When I search for images using '#search-chips-featured ~"search-chips" photoshoot:"Search Chips Harbour Shoot" persisted:archived'
    Then the search results should contain exactly chip fixtures "staff-photo-multi-persisted"
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 88-100, 150-168
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 87-148
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 181-201, 323-329

  Scenario: Platform and status filters must match the same usage
    Given I am searching chip fixtures "split-print-and-published-usages,print-published-at-midnight" with all usage rights included
    When I search for images using "usages@platform:print usages@status:published"
    Then the search results should contain exactly chip fixtures "print-published-at-midnight"
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 165-198
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 225-230

  Scenario Outline: Replaced defaults and explicit status filters apply to the whole image
    Given I am searching chip fixtures "print-published-at-midnight,published-and-replaced-usages" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Usage status combination <Query> returns <Matches>

    Examples: Usage status combination <Query> returns <Matches>
      | Query                                           | Matches                       |
      | usages@status:published                         | print-published-at-midnight   |
      | usages@status:replaced                          | published-and-replaced-usages |
      | usages@status:published -usages@status:replaced | print-published-at-midnight   |
      | usages@status:published usages@status:replaced  | none                          |
      | usages@status:replaced -usages@status:published | none                          |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/Parser.scala lines 5-29
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 165-198
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 228-237

  Scenario Outline: Date constraints distinguish inclusive usage boundaries and missing capture dates
    Given I am searching chip fixtures "<Fixtures>" with all usage rights included
    When I search for images using '<Query>'
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Date combination <Query> returns <Matches>

    Examples: Date combination <Query> returns <Matches>
      | Fixtures                                                  | Query                                             | Matches                      |
      | print-published-at-midnight,published-and-replaced-usages | usages@>added:2024-06-15 usages@<added:2024-06-15 | print-published-at-midnight  |
      | print-published-at-midnight,missing-metadata-unpersisted  | date:2024-06-15 has:dateTaken                     | print-published-at-midnight  |
      | print-published-at-midnight,missing-metadata-unpersisted  | date:2024-06-15 -has:dateTaken                    | missing-metadata-unpersisted |
  # Evidence: kahuna/public/js/search/query.html lines 11-15
  # Evidence: media-api/app/lib/querysyntax/QuerySyntax.scala lines 61-78, 203-225
  # Evidence: media-api/app/lib/elasticsearch/QueryBuilder.scala lines 112-119, 165-198
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 7, 225-237, 323-329

  Scenario Outline: Deleted images are explicitly filtered by the requested uploader
    Given I am searching chip fixtures "deleted-own-upload,deleted-other-upload" with all usage rights included
    When I search for images using "<Query>"
    Then the search results should contain exactly chip fixtures "<Matches>"
    # title-format: Deleted image query <Query> returns <Matches>

    Examples: Deleted image query <Query> returns <Matches>
      | Query                                                 | Matches              |
      | uploader:grid-e2e-account@guardian.co.uk              | none                 |
      | is:deleted uploader:grid-e2e-account@guardian.co.uk   | deleted-own-upload   |
      | is:deleted uploader:search-chips-other@guardian.co.uk | deleted-other-upload |
  # Evidence: media-api/app/lib/querysyntax/Parser.scala lines 5-29, 42-56
  # Evidence: media-api/app/controllers/MediaApi.scala lines 48-54
  # Evidence: e2e-tests/fixtures/permissions/permissions.json lines 59-73
  # Evidence: e2e-tests/fixtures/elasticsearch/search-chips.ts lines 238-242
