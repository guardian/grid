@image-title-and-description
Feature: Viewing and editing an image's title and description
  This lets a user see an image's title and description, search by its title, and lets
  users who may edit the image change the title and description of one or several images,
  and preview the title and description a metadata template would apply.

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth

  # ---------------------------------------------------------------------------
  # Display and permissions
  # ---------------------------------------------------------------------------
  Scenario: A user with edit permission can edit the title and description
    Given I am signed in with edit metadata permission
    And the image has the title "Harbour at dawn" and the description "Boats moored in the harbour"
    When I open the single image view of the image
    Then I see "Harbour at dawn" in the "Title" region
    And I see "Boats moored in the harbour" as the description
    And I see an edit button for the title and for the description
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 131-145, 176-183, 196-209, 212-223
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 515-524
  # Evidence: kahuna/public/js/image/view.html lines 169-172

  Scenario: A user without edit permission sees the title and description read-only
    Given I am signed in without edit metadata permission
    And the image has the title "Harbour at dawn" and the description "Boats moored in the harbour"
    When I open the single image view of the image
    Then I see "Harbour at dawn" in the "Title" region
    And I see "Boats moored in the harbour" as the description
    And I do not see an edit button for the title or for the description
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 131-145, 185-192, 196-209, 225-236
  # Evidence: kahuna/public/js/image/view.html lines 169-172

  Scenario: A user with edit permission is prompted to add a missing title and description
    Given I am signed in with edit metadata permission
    And the image has no title and no description
    When I open the single image view of the image
    Then the title shows "Unknown (click ✎ to add)"
    And the description shows "Unknown (click ✎ to add)"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 167-170, 218-222

  Scenario: A user without edit permission sees a missing title and description as unknown
    Given I am signed in without edit metadata permission
    And the image has no title and no description
    When I open the single image view of the image
    Then the title shows "Unknown"
    And the description shows "Unknown"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 167, 171-173, 231-235

  Scenario: A user with edit permission is prompted to edit differing titles and descriptions together
    Given I am signed in with edit metadata permission
    And 2 images with different titles and different descriptions are shown in search results
    When I select both images
    Then the title shows "Multiple titles (click ✎ to edit all)"
    And the description shows "Multiple descriptions (click ✎ to edit all)"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 146, 155-159, 211-216
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 186, 502-524
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-55

  Scenario: A user without edit permission sees that the selected images have differing titles and descriptions
    Given I am signed in without edit metadata permission
    And 2 images with different titles and different descriptions are shown in search results
    When I select both images
    Then the title shows "Multiple titles"
    And the description shows "Multiple descriptions"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 146, 161-165, 225-229
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 186, 502-524
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-55

  # ---------------------------------------------------------------------------
  # Searching by title
  # ---------------------------------------------------------------------------
  Scenario: Clicking the title searches for images with that title
    Given I am signed in without edit metadata permission
    And the image has the title "Harbour at dawn"
    And I have opened the single image view of the image
    When I click the title
    Then the search results are shown for the query 'title:"Harbour at dawn"'
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 176-192
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 437
  # Evidence: kahuna/public/js/search/query-filter.js lines 7-22, 55-57

  Scenario: Shift-clicking the title adds it to the current search
    Given I am signed in with edit metadata permission
    And an image with the title "Harbour" is shown in search results for "boats"
    And I have selected the image
    When I shift-click the title
    Then the search results are shown for the query "boats title:Harbour"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 176-183
  # Evidence: kahuna/public/js/search/query-filter.js lines 27-52

  Scenario: Alt-clicking the title excludes it from the current search
    Given I am signed in with edit metadata permission
    And an image with the title "Harbour" is shown in search results for "boats"
    And I have selected the image
    When I alt-click the title
    Then the search results are shown for the query "boats -title:Harbour"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 176-183
  # Evidence: kahuna/public/js/search/query-filter.js lines 27-52

  # ---------------------------------------------------------------------------
  # Editing the title
  # ---------------------------------------------------------------------------
  Scenario: Opening the title editor shows the current title in a text field
    Given I am signed in with edit metadata permission
    And the image has the title "Harbour at dawn"
    And I have opened the single image view of the image
    When I click the title edit button
    Then a text field containing "Harbour at dawn" is shown
    And the title edit button is hidden
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 142-153

  Scenario: Saving a new title updates the image
    Given I am signed in with edit metadata permission
    And the image has the title "Harbour at dawn"
    And I have opened the single image view of the image
    When I change the title to "Harbour at dusk" and save
    Then the title shows "Harbour at dusk"
    And the image still has the title "Harbour at dusk" after a reload
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 147-153
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 173-178, 229-248
  # Evidence: kahuna/public/js/edits/service.js lines 254-275, 333-352

  Scenario: Cancelling the title editor keeps the original title
    Given I am signed in with edit metadata permission
    And the image has the title "Harbour at dawn"
    And I have opened the single image view of the image
    When I change the title to "Harbour at dusk" and cancel
    Then the title shows "Harbour at dawn"
    And the title edit button is shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 142-153

  Scenario: Saving a title for several images replaces each image's title
    Given I am signed in with edit metadata permission
    And 2 images with different titles and different descriptions are shown in search results
    And I have selected both images
    When I change the title to "Harbour" and save
    Then both images have the title "Harbour"
    And the title shows "Harbour"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 142-160
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 206, 229-248
  # Evidence: kahuna/public/js/edits/service.js lines 333-352

  # ---------------------------------------------------------------------------
  # Editing the description
  # ---------------------------------------------------------------------------
  Scenario: Opening the description editor shows the description with the cursor at the end
    Given I am signed in with edit metadata permission
    And the image has the description "Boats moored in the harbour"
    And I have opened the single image view of the image
    When I click the description edit button
    Then a text area containing "Boats moored in the harbour" is shown
    And the cursor is at the end of the description
    And "Cancel" and "Save" buttons are shown
    And the description edit button is hidden
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 205-211, 238-247, 259-267
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 137-167

  Scenario: Saving a new description updates the image
    Given I am signed in with edit metadata permission
    And the image has the description "Boats moored in the harbour"
    And I have opened the single image view of the image
    When I change the description to "Fishing boats at rest" and click "Save"
    Then the description shows "Fishing boats at rest"
    And the image still has the description "Fishing boats at rest" after a reload
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 210, 264-266
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 212-214, 229-248
  # Evidence: kahuna/public/js/edits/service.js lines 254-275, 333-352

  Scenario: Cancelling the description editor keeps the original description
    Given I am signed in with edit metadata permission
    And the image has the description "Boats moored in the harbour"
    And I have opened the single image view of the image
    When I change the description to "Fishing boats at rest" and click "Cancel"
    Then the description shows "Boats moored in the harbour"
    And the description edit button is shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 205-211, 259-263

  Scenario: Pressing Escape in the description editor cancels the edit
    Given I am signed in with edit metadata permission
    And the image has the description "Boats moored in the harbour"
    And I have opened the single image view of the image
    When I change the description to "Fishing boats at rest" and press Escape
    Then the description shows "Boats moored in the harbour"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 210, 260
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 94-128

  Scenario Outline: Pressing <keys> in the description editor saves the edit
    Given I am signed in with edit metadata permission
    And the image has the description "Boats moored in the harbour"
    And I have opened the single image view of the image
    When I change the description to "Fishing boats at rest" and press <keys>
    Then the description shows "Fishing boats at rest"

    # title-format: <keys> saves the description
    Examples:
      | keys          |
      | Control+Enter |
      | Meta+Enter    |
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 210, 264
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 94-128

  Scenario: Editing the description of one image offers no edit options
    Given I am signed in with edit metadata permission
    And the image has the description "Boats moored in the harbour"
    And I have opened the single image view of the image
    When I click the description edit button
    Then I do not see the "Overwrite", "Add before" and "Add after" options
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 248-253

  Scenario: Editing differing descriptions offers overwrite, add before and add after options
    Given I am signed in with edit metadata permission
    And 2 images with different titles and different descriptions are shown in search results
    And I have selected both images
    When I click the description edit button
    Then I see the "Overwrite", "Add before" and "Add after" options
    And "Overwrite" is selected
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 248-253
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 206-208
  # Evidence: kahuna/public/js/util/constants/editOptions.js lines 1-5
  # Evidence: kahuna/public/js/components/gr-radio-list/gr-radio-list.html lines 1-12

  Scenario Outline: Saving a description for several images applies the chosen edit option to each image
    Given I am signed in with edit metadata permission
    And 2 images with the descriptions "Boats" and "Cars" are shown in search results
    And I have selected both images
    When I enter the description "Old" with the "<option>" option and save
    Then the images have the descriptions "<first>" and "<second>"

    # title-format: <option> gives the descriptions <first> and <second>
    Examples:
      | option     | first     | second   |
      | Overwrite  | Old       | Old      |
      | Add before | Old Boats | Old Cars |
      | Add after  | Boats Old | Cars Old |
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 210, 248-253
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 206-214, 229-248
  # Evidence: kahuna/public/js/edits/service.js lines 333-352
  # Evidence: kahuna/public/js/util/constants/editOptions.js lines 1-5

  # ---------------------------------------------------------------------------
  # Metadata template preview
  # ---------------------------------------------------------------------------
  Scenario: Selecting a metadata template previews its title and description
    Given I am signed in with edit metadata permission
    And the image has the title "Harbour at dawn" and the description "Boats moored in the harbour"
    And a metadata template sets the title "Template title" and the description "Template description"
    And I have opened the single image view of the image
    When I select that metadata template
    Then "Template title" is shown highlighted as a title preview
    And "Template description" is shown highlighted as a description preview
    And I do not see an edit button for the title or for the description
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 2-15, 136-140, 199-203
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 588-598

  Scenario: A metadata template that changes only the title still locks the description
    Given I am signed in with edit metadata permission
    And the image has the title "Harbour at dawn" and the description "Boats moored in the harbour"
    And a metadata template sets only the title "Template title"
    And I have opened the single image view of the image
    When I select that metadata template
    Then "Template title" is shown highlighted as a title preview
    And I see "Boats moored in the harbour" as the description
    And I do not see an edit button for the description
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 2, 136-145, 199-209
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 588-598

  Scenario: Cancelling a metadata template restores the title and description
    Given I am signed in with edit metadata permission
    And the image has the title "Harbour at dawn" and the description "Boats moored in the harbour"
    And a metadata template sets the title "Template title" and the description "Template description"
    And I have opened the single image view of the image
    And I have selected that metadata template
    When I cancel the metadata template
    Then I see "Harbour at dawn" in the "Title" region
    And I see "Boats moored in the harbour" as the description
    And I see an edit button for the title and for the description
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 2-15, 136-145, 199-209
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 647-654
