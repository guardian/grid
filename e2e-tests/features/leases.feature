Feature: Viewing and managing an image's leases
  This lets a user see the use and syndication leases on an image, and lets users who
  may edit the image add or delete leases, preview leases a metadata template would
  apply, and copy or clear leases across every image in a multi-image upload.

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth

  # ---------------------------------------------------------------------------
  # Section visibility and permissions
  # ---------------------------------------------------------------------------
  Scenario: A user with edit permission sees the add lease control
    Given I am signed in with edit metadata permission
    And the image has no leases
    When I open the single image view of the image
    Then I see a "Leases" region
    And I see an "Add lease to image" button
  # Evidence: kahuna/public/js/leases/leases.html lines 4-15
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 113-127
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 541
  # Evidence: kahuna/public/js/image/view.html lines 169-172
  # Evidence: kahuna/public/js/image/controller.js lines 180-182
  # Evidence: kahuna/public/js/edits/service.js lines 245-248

  Scenario: A user without edit permission sees leases read-only
    Given I am signed in without edit metadata permission
    And the image has an active "allow-use" lease
    When I open the single image view of the image
    Then I see the "Allow use" lease in the "Leases" region
    And I do not see an "Add lease to image" button
    And I do not see a delete control on the lease
  # Evidence: kahuna/public/js/leases/leases.html lines 6, 142-163
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 113-127
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 541
  # Evidence: kahuna/public/js/edits/service.js lines 245-248

  Scenario: The Leases section is hidden from a user without edit permission when there are no leases
    Given I am signed in without edit metadata permission
    And the image has no leases
    When I open the single image view of the image
    Then I do not see a "Leases" region
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 113
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 541

  # ---------------------------------------------------------------------------
  # Lease display
  # ---------------------------------------------------------------------------
  Scenario Outline: Each lease shows its human-readable access type
    Given I am signed in without edit metadata permission
    And the image has an active "<access>" lease
    When I open the single image view of the image
    Then the lease is labelled "<label>"

    # title-format: A <access> lease is labelled <label>
    Examples:
      | access            | label             |
      | allow-use         | Allow use         |
      | deny-use          | Deny use          |
      | allow-syndication | Allow syndication |
      | deny-syndication  | Deny syndication  |
  # Evidence: kahuna/public/js/leases/leases.html lines 143, 152
  # Evidence: kahuna/public/js/leases/leases.js lines 279-288

  Scenario: A lease shows when it started, when it expires and its notes
    Given I am signed in without edit metadata permission
    And the image has a lease that started 2 days ago, expires in 3 days and has the notes "Agreed by picture desk"
    When I open the single image view of the image
    Then the lease shows "Started 2 days ago"
    And the lease shows "Expires in 3 days"
    And the lease shows "Agreed by picture desk"
  # Evidence: kahuna/public/js/leases/leases.html lines 153-155
  # Evidence: kahuna/public/js/leases/leases.js lines 234-255

  Scenario: A future lease shows when it starts
    Given I am signed in without edit metadata permission
    And the image has a lease that starts in 3 days
    When I open the single image view of the image
    Then the lease shows "Starts in 3 days"
  # Evidence: kahuna/public/js/leases/leases.html lines 153
  # Evidence: kahuna/public/js/leases/leases.js lines 234-242

  Scenario: An expired lease is faded and shows when it expired
    Given I am signed in without edit metadata permission
    And the image has an inactive lease that expired 2 days ago
    When I open the single image view of the image
    Then the lease shows "Expired 2 days ago"
    And the lease is shown as inactive
  # Evidence: kahuna/public/js/leases/leases.html lines 149, 154
  # Evidence: kahuna/public/js/leases/leases.js lines 244-255, 259-262
  # Evidence: kahuna/public/js/leases/leases.css lines 132-134

  Scenario: A lease without an end date never expires
    Given I am signed in without edit metadata permission
    And the image has a lease with no end date
    When I open the single image view of the image
    Then the lease shows "Never expires"
  # Evidence: kahuna/public/js/leases/leases.html lines 154
  # Evidence: kahuna/public/js/leases/leases.js lines 244-255

  Scenario: Hovering a lease shows who created it and when
    Given I am signed in without edit metadata permission
    And the image has a lease created by "jane.doe@example.com" on 1 Mar 2026 at 09:30
    When I open the single image view of the image
    And I hover over the lease
    Then I see a tooltip with "leased by: jane.doe@example.com"
    And I see a tooltip with "leased at: 1 Mar 2026, 09:30"
  # Evidence: kahuna/public/js/leases/leases.html lines 144-147
  # Evidence: kahuna/public/js/leases/leases.js lines 211-213

  # Note: activeLeases()/inactiveLeases() have no return statement, so the counts render
  # blank today. This scenario records the current (legacy) behaviour.
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

  # ---------------------------------------------------------------------------
  # Adding a lease
  # ---------------------------------------------------------------------------
  Scenario: Opening the add lease form
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image
    When I choose to add a lease
    Then the add lease form is shown with "Please select access" selected
    And the access options are grouped as Usage "Allow use", "Deny use" and Syndication "Allow syndication", "Deny syndication"
    And the form has "Close" and "Save new lease" buttons
  # Evidence: kahuna/public/js/leases/leases.html lines 5, 11, 34-48, 103-116
  # Evidence: kahuna/public/js/leases/leases.js lines 45-49

  Scenario: Cancelling the add lease form closes it without saving
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image
    And the add lease form is open
    When I cancel the form
    Then the add lease form is hidden
    And the image's leases are unchanged
  # Evidence: kahuna/public/js/leases/leases.html lines 34-35, 104-106
  # Evidence: kahuna/public/js/leases/leases.js lines 54-57, 185-195

  Scenario Outline: Choosing a use lease offers a date range that defaults to expiring in two days
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image
    And the add lease form is open
    When I choose "<access>" access
    Then a start and end date range is shown
    And the end date defaults to the end of the day after tomorrow
    And a notes field is shown

    # title-format: <access> offers a date range defaulting to two days
    Examples:
      | access    |
      | Allow use |
      | Deny use  |
  # Evidence: kahuna/public/js/leases/leases.html lines 90-95, 98-101
  # Evidence: kahuna/public/js/leases/leases.js lines 306-314

  Scenario: Choosing deny syndication offers an optional expiry date
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image
    And the add lease form is open
    When I choose "Deny syndication" access and tick "Expire"
    Then an "after" date picker is shown for the end date
    And dates before tomorrow cannot be chosen
  # Evidence: kahuna/public/js/leases/leases.html lines 51-64
  # Evidence: kahuna/public/js/leases/leases.js lines 52

  Scenario: Choosing allow syndication offers an optional delay and agency clauses
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image
    And the add lease form is open
    When I choose "Allow syndication" access and tick "Delay"
    Then an "after" date picker is shown for the start date
    And dates before tomorrow cannot be chosen
    And "Call Agency" and "Premium" options are shown
  # Evidence: kahuna/public/js/leases/leases.html lines 65-89
  # Evidence: kahuna/public/js/leases/leases.js lines 52

  Scenario: Saving without choosing an access type is rejected
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image
    And the add lease form is open
    When I save the lease without choosing an access type
    Then I am alerted "Please select an access type (Allow or Deny)"
    And no lease is added to the image
  # Evidence: kahuna/public/js/leases/leases.html lines 36, 38-39
  # Evidence: kahuna/public/js/leases/leases.js lines 59-61, 197-199

  Scenario: Saving a use lease adds it to the image
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image with no leases
    When I add a "Deny use" lease with the notes "Legal hold"
    Then the add lease control shows "Updating..." while the lease is saved
    And the image shows a "Deny use" lease with the notes "Legal hold"
    And the add lease form is hidden
  # Evidence: kahuna/public/js/leases/leases.html lines 11-13, 35, 111, 142-155
  # Evidence: kahuna/public/js/leases/leases.js lines 59-67, 104-111, 185-195, 222-232, 297-299
  # Evidence: kahuna/public/js/services/api/leases.js lines 74-82, 96-114, 140-170

  Scenario: Allow syndication clauses are prepended to the lease notes
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image with no leases
    When I add an "Allow syndication" lease with "Call Agency" and "Premium" ticked and the notes "Front only"
    Then the image shows an "Allow syndication" lease with the notes "CALL AGENCY, PREMIUM, Front only"
    And the lease shows "Never expires"
  # Evidence: kahuna/public/js/leases/leases.html lines 79-88
  # Evidence: kahuna/public/js/leases/leases.js lines 73-83, 244-255

  Scenario: A deny syndication lease is saved without a start date
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image with no leases
    When I add a "Deny syndication" lease
    Then the image shows a "Deny syndication" lease with no start date
  # Evidence: kahuna/public/js/leases/leases.html lines 51-64, 153
  # Evidence: kahuna/public/js/leases/leases.js lines 69-71, 234-242

  Scenario: Confirming an overwrite replaces the existing syndication lease
    Given I am signed in with edit metadata permission
    And the image has an "allow-syndication" lease
    And I have opened the single image view of the image
    When I add a "Deny syndication" lease
    Then I am asked "This image already has a syndication lease. It will be overwritten. Do you wish to proceed?"
    When I accept the confirmation
    Then the image shows a "Deny syndication" lease and no "Allow syndication" lease
  # Evidence: kahuna/public/js/leases/leases.js lines 85-104
  # Evidence: kahuna/public/js/services/api/leases.js lines 205-207

  # Note: after declining, the controller leaves the form hidden and the add control showing
  # "Updating..." (ctrl.adding stays true). This records only the persisted outcome.
  Scenario: Declining an overwrite keeps the existing syndication lease
    Given I am signed in with edit metadata permission
    And the image has an "allow-syndication" lease
    And I have opened the single image view of the image
    When I add a "Deny syndication" lease and decline the overwrite confirmation
    Then the image still has only its "Allow syndication" lease
  # Evidence: kahuna/public/js/leases/leases.js lines 63-64, 90-100

  Scenario: Adding a syndication lease to several images warns about overwriting
    Given I am signed in with edit metadata permission
    And 2 images are shown in search results and one has a syndication lease
    When I select both images and add an "Allow syndication" lease
    Then I am asked "One or more of the selected images have syndication leases. These will be overwritten. Do you wish to proceed?"
  # Evidence: kahuna/public/js/leases/leases.js lines 85-96
  # Evidence: kahuna/public/js/components/gr-info-panel/gr-info-panel.html lines 50-54

  Scenario: A failed save tells the user to try again
    Given I am signed in with edit metadata permission
    And I have opened the single image view of an image
    And saving leases will fail
    When I add an "Allow use" lease
    Then I am alerted "Something went wrong when saving, please try again."
  # Evidence: kahuna/public/js/leases/leases.js lines 104-111, 290-293

  # ---------------------------------------------------------------------------
  # Deleting a lease
  # ---------------------------------------------------------------------------
  Scenario: Deleting a lease needs a second click to confirm
    Given I am signed in with edit metadata permission
    And the image has an active "allow-use" lease
    And I have opened the single image view of the image
    When I click delete on the lease
    Then the delete control changes to "Confirm delete"
    And the lease is still on the image
  # Evidence: kahuna/public/js/leases/leases.html lines 157-159
  # Evidence: kahuna/public/js/components/gr-confirm-delete/gr-confirm-delete.js lines 11-32

  Scenario: Confirming delete removes the lease
    Given I am signed in with edit metadata permission
    And the image has an active "allow-use" lease
    And I have opened the single image view of the image
    When I delete the lease and confirm
    Then the "Allow use" lease is no longer shown
  # Evidence: kahuna/public/js/leases/leases.html lines 157-159
  # Evidence: kahuna/public/js/leases/leases.js lines 202-209, 297-299
  # Evidence: kahuna/public/js/services/api/leases.js lines 125-134, 140-170
  # Evidence: kahuna/public/js/components/gr-confirm-delete/gr-confirm-delete.js lines 21, 26-27

  Scenario: The delete confirmation lapses after five seconds
    Given I am signed in with edit metadata permission
    And the image has an active "allow-use" lease
    And I have opened the single image view of the image
    When I click delete on the lease and wait five seconds
    Then the delete control shows "Delete" again
    And the lease is still on the image
  # Evidence: kahuna/public/js/components/gr-confirm-delete/gr-confirm-delete.js lines 16-17, 23-31

  Scenario: A failed delete tells the user to try again
    Given I am signed in with edit metadata permission
    And the image has an active "allow-use" lease
    And I have opened the single image view of the image
    And deleting leases will fail
    When I delete the lease and confirm
    Then I am alerted "Something when wrong when deleting, please try again!"
  # Evidence: kahuna/public/js/leases/leases.js lines 202-209, 290-293

  # ---------------------------------------------------------------------------
  # Metadata template preview
  # ---------------------------------------------------------------------------
  Scenario: Selecting a metadata template previews its leases alongside existing ones
    Given I am signed in with edit metadata permission
    And the image has an active "allow-use" lease
    And a metadata template adds a "deny-syndication" lease without replacing existing leases
    And I have opened the single image view of the image
    When I select that metadata template
    Then the "Deny syndication" lease is shown highlighted as a preview
    And the existing "Allow use" lease is still shown
    And no delete controls are shown on the leases
  # Evidence: kahuna/public/js/leases/leases.html lines 126-141
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 588-606
  # Evidence: kahuna/public/js/leases/leases.css lines 169-171

  Scenario: A replacing metadata template previews only its own leases
    Given I am signed in with edit metadata permission
    And the image has an active "allow-use" lease
    And a metadata template replaces existing leases with a "deny-use" lease
    And I have opened the single image view of the image
    When I select that metadata template
    Then only the "Deny use" lease is shown, highlighted as a preview
  # Evidence: kahuna/public/js/leases/leases.html lines 126-141
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 600-606

  Scenario: Applying a metadata template shows the leases updating
    Given I am signed in with edit metadata permission
    And a metadata template adds a "deny-syndication" lease
    And I have opened the single image view of an image
    When I apply that metadata template
    Then the add lease control shows "Updating..." until the leases are saved
  # Evidence: kahuna/public/js/leases/leases.html lines 11-13
  # Evidence: kahuna/public/js/leases/leases.js lines 330
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 119-127
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 631-644

  # ---------------------------------------------------------------------------
  # Upload page: batch apply
  # ---------------------------------------------------------------------------
  Scenario: Apply-to-all is only offered when uploading more than one image
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    When I upload 1 image
    Then the upload's leases have an "Add lease to image" button
    And I do not see an "Apply these leases to all current uploads" button
  # Evidence: kahuna/public/js/leases/leases.html lines 16-22
  # Evidence: kahuna/public/js/edits/image-editor.html lines 187-194
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 40-42

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

  Scenario: Apply-to-all from an upload with no leases asks to remove all leases
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    And the first upload has no leases
    When I apply the first upload's leases to all current uploads
    Then I see a "Remove ALL leases in job?" button in place of the apply-to-all button
  # Evidence: kahuna/public/js/leases/leases.html lines 17-30
  # Evidence: kahuna/public/js/leases/leases.js lines 167-176

  Scenario: The remove all leases prompt lapses after five seconds
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    And the "Remove ALL leases in job?" prompt is shown on the first upload
    When I wait five seconds
    Then the apply-to-all button is shown again
  # Evidence: kahuna/public/js/leases/leases.html lines 17-30
  # Evidence: kahuna/public/js/leases/leases.js lines 171-175

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

  Scenario: Apply-to-all is hidden while a metadata template preview is shown
    Given I am signed in with edit metadata permission
    And I have opened the image upload page
    And I have uploaded 2 images
    When I select a metadata template with leases for the first upload
    Then the first upload does not show the apply-to-all button
  # Evidence: kahuna/public/js/leases/leases.html lines 16
  # Evidence: kahuna/public/js/edits/image-editor.js lines 233-248
