Feature: Rights and restrictions in the search results panel and upload editor
  The rights and restrictions section and its editor are shared with the single image
  view, which covers them in depth (see rights-and-restrictions.feature). These scenarios
  check that the search results panel and the upload editor pass the image and the edit
  permission to the section and refresh it after a save, plus the behaviour that only a
  selection of several images in the search results panel can reach.

  Background:
    Given the application stack is running

  # ---------------------------------------------------------------------------
  # Wiring
  # ---------------------------------------------------------------------------
  # Starts from a real category: a broken image binding shows "Unknown", and the upload
  # editor opens its rights editor automatically for an image without a category.
  Scenario Outline: Rights can be viewed and changed
    Given I am working in the <surface>
    And I am signed in with edit metadata permission
    And the image has the "Agency - subscription" usage rights category
    Then the rights and restrictions section shows "Agency - subscription"
    When I choose to edit the rights and restrictions
    And I save the "Pay to use" usage rights category
    Then the rights editor closes
    And the rights and restrictions section shows "Pay to use"

    # title-format: Viewing and changing rights in the <surface>
    Examples:
      | surface              |
      | search results panel |
      | upload editor        |
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-55
  # Evidence: kahuna/public/js/search/results.js lines 831-845 (images-updated refreshes the selection after a save)
  # Evidence: kahuna/public/js/edits/image-editor.html lines 146-179
  # Evidence: kahuna/public/js/edits/image-editor.js lines 83, 179, 193-194, 293-298, 316-320
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 213-226

  Scenario: Selected images can't be edited without permission
    Given I am working in the search results panel
    And I am signed in without edit metadata permission
    And the image was uploaded by someone else
    Then the edit rights and restrictions button is not shown
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.js lines 54-59
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 40-44

  # ---------------------------------------------------------------------------
  # Selecting several images in the search results panel
  # ---------------------------------------------------------------------------
  # Without edit metadata permission, only the user's own uploads are editable. The editable
  # image is selected first so that checking only the first image would show the button.
  Scenario Outline: Rights can only be edited when every selected image is editable
    Given I am working in the search results panel
    And I am signed in without edit metadata permission
    And I have selected <selection>
    Then the edit rights and restrictions button is <shown>

    # title-format: The edit button is <shown> when <selection> are selected
    Examples:
      | selection                                                       | shown     |
      | two images uploaded by me                                       | shown     |
      | an image uploaded by me, then an image uploaded by someone else | not shown |
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.js lines 54-59
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 40-44
  # Evidence: kahuna/public/js/search/results.js lines 783

  Scenario: The rights editor can't save "Multiple categories"
    Given I am working in the search results panel
    And I am signed in with edit metadata permission
    And I have selected images with the "Agency - subscription" and "Pay to use" usage rights categories
    Then the rights and restrictions section shows "multiple categories"
    When I choose to edit the rights and restrictions
    Then the rights editor shows the "Multiple categories" category
    And the rights can't be saved
    When I select the "Pay to use" usage rights category
    Then the rights can be saved
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 485-494
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 36, 65-88, 108, 163-174
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 20-23, 204-208

  Scenario: Saving rights for a mixed selection applies them to every image
    Given I am working in the search results panel
    And I am signed in with edit metadata permission
    And I have selected images with the "Agency - subscription" and "Pay to use" usage rights categories
    Then the rights and restrictions section shows "multiple categories"
    When I choose to edit the rights and restrictions
    And I save the "Pay to use" usage rights category
    Then the rights editor closes
    And the rights and restrictions section shows "Pay to use"
    And every selected image has the "Pay to use" usage rights category
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 213-226
  # Evidence: kahuna/public/js/util/batch-tracking.js lines 23-60
  # Evidence: kahuna/public/js/search/results.js lines 831-845
