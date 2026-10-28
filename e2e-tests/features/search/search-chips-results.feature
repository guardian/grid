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
