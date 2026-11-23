Feature: Leases across the search info panel and upload page
  Smoke tests that the lease widget works on every surface that hosts it, plus the lease
  behaviour only those surfaces have: managing leases on several selected images at once,
  and copying or clearing leases across every image in a multi-image upload.

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth

  # ---------------------------------------------------------------------------
  # Smoke: the lease widget works on each surface
  # ---------------------------------------------------------------------------
  Scenario: Adding a lease in the single image view
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image with no leases
    When I add an "Allow use" lease
    Then the "Leases" region shows an "Allow use" lease
  # Evidence: kahuna/public/js/leases/leases.html lines 4-15, 34-36, 142-155
  # Evidence: kahuna/public/js/leases/leases.js lines 59-67, 104-111, 297-299
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 113-127
  # Evidence: kahuna/public/js/image/view.html lines 169-172

  @todo
  Scenario: Adding a lease from the search info panel
    Given I am signed in with edit metadata permission
    And an image with no leases is shown in search results
    And I have selected the image
    When I add an "Allow use" lease from the info panel
    Then the info panel's "Leases" region shows an "Allow use" lease
  # Evidence: kahuna/public/js/leases/leases.html lines 4-15, 34-36, 126, 142-155
  # Evidence: kahuna/public/js/leases/leases.js lines 59-67, 104-111, 297-304
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-54
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.js lines 54-59
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 113-127

  @todo
  Scenario: Adding a lease to an upload
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 1 image
    When I add an "Allow use" lease to the upload
    Then the upload shows an "Allow use" lease
  # Evidence: kahuna/public/js/leases/leases.html lines 4-15, 34-36, 142-155
  # Evidence: kahuna/public/js/leases/leases.js lines 59-67, 104-111, 297-299
  # Evidence: kahuna/public/js/edits/image-editor.html lines 182-194
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 40-42

  # ---------------------------------------------------------------------------
  # Search info panel: several images selected
  # ---------------------------------------------------------------------------
  # Note: activeLeases()/inactiveLeases() have no return statement, so the counts render
  # blank today. This scenario records the current (legacy) behaviour.
  @todo
  Scenario: Selecting several images shows a lease summary instead of the lease list
    Given I am signed in with edit metadata permission
    And 2 images with leases are shown in search results
    When I select both images
    Then the info panel's "Leases" region shows " current leases +  inactive leases"
    And no individual leases are listed
  # Evidence: kahuna/public/js/leases/leases.html lines 122-126
  # Evidence: kahuna/public/js/leases/leases.js lines 215-220, 301-304
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-54
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.js lines 54-59

  @todo
  Scenario: Adding a lease to several selected images adds it to each one
    Given I am signed in with edit metadata permission
    And 2 images with no leases are shown in search results
    And I have selected both images
    When I add a "Deny use" lease from the info panel
    Then each image has a "Deny use" lease
  # Evidence: kahuna/public/js/leases/leases.js lines 59-67, 104-111
  # Evidence: kahuna/public/js/services/api/leases.js lines 74-82, 96-114
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-54

  @todo
  Scenario: Adding a syndication lease to several images warns about overwriting
    Given I am signed in with edit metadata permission
    And 2 images are shown in search results and one has a syndication lease
    When I select both images and add an "Allow syndication" lease
    Then I am asked "One or more of the selected images have syndication leases. These will be overwritten. Do you wish to proceed?"
  # Evidence: kahuna/public/js/leases/leases.js lines 85-96
  # Evidence: kahuna/public/js/services/api/leases.js lines 205-207
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-54

  # ---------------------------------------------------------------------------
  # Upload page
  # ---------------------------------------------------------------------------
  # Note: the upload editor hard-codes gr-user-can-edit="true", so the add lease control is
  # shown even when the image editor itself is read-only. This records legacy behaviour.
  @todo
  Scenario: The add lease control is offered on an upload the user cannot otherwise edit
    Given I am signed in without edit metadata permission
    And I have opened the image upload page
    When I upload an image that another user has already uploaded
    Then the upload's metadata is read-only
    And the upload's leases have an "Add lease to image" button
  # Evidence: kahuna/public/js/leases/leases.html lines 4-9
  # Evidence: kahuna/public/js/edits/image-editor.html lines 187-194, 200
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 40-42

  @todo
  Scenario: Apply-to-all is only offered when uploading more than one image
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    When I upload 1 image
    Then the upload's leases have an "Add lease to image" button
    And I do not see an "Apply these leases to all current uploads" button
  # Evidence: kahuna/public/js/leases/leases.html lines 16-22
  # Evidence: kahuna/public/js/edits/image-editor.html lines 187-194
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 40-42

  @todo
  Scenario: Applying one upload's leases to all current uploads
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    And the first upload has a "deny-use" lease
    When I apply the first upload's leases to all current uploads
    Then the other upload shows "Updating..." while its leases are replaced
    And both uploads show a "Deny use" lease
  # Evidence: kahuna/public/js/leases/leases.html lines 1-3, 16-22, 121
  # Evidence: kahuna/public/js/leases/leases.js lines 123, 152-159, 167-170, 185-195
  # Evidence: kahuna/public/js/services/api/leases.js lines 52-72
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 40-42

  @todo
  Scenario: Apply-to-all from an upload with no leases asks to remove all leases
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    And the first upload has no leases
    When I apply the first upload's leases to all current uploads
    Then I see a "Remove ALL leases in job?" button in place of the apply-to-all button
  # Evidence: kahuna/public/js/leases/leases.html lines 17-30
  # Evidence: kahuna/public/js/leases/leases.js lines 167-176

  @todo
  Scenario: The remove all leases prompt lapses after five seconds
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    And the "Remove ALL leases in job?" prompt is shown on the first upload
    When I wait five seconds
    Then the apply-to-all button is shown again
  # Evidence: kahuna/public/js/leases/leases.html lines 17-30
  # Evidence: kahuna/public/js/leases/leases.js lines 171-175

  @todo
  Scenario: Confirming remove all clears the leases on every upload
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    And the second upload has a "deny-use" lease
    And the "Remove ALL leases in job?" prompt is shown on the first upload
    When I confirm removing all leases
    Then neither upload has any leases
  # Evidence: kahuna/public/js/leases/leases.html lines 24-30
  # Evidence: kahuna/public/js/leases/leases.js lines 124, 160-165, 179-182
  # Evidence: kahuna/public/js/services/api/leases.js lines 40-50

  @todo
  Scenario: Apply-to-all is hidden while a metadata template preview is shown
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    When I select a metadata template with leases for the first upload
    Then the first upload does not show the apply-to-all button
  # Evidence: kahuna/public/js/leases/leases.html lines 16
  # Evidence: kahuna/public/js/edits/image-editor.js lines 233-248
