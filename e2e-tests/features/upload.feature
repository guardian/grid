# Uploads mutate the single shared e2e user's upload history, so scenarios must not race.
@mode:serial
Feature: Uploading images to the Grid
  This lets an authorised user get images into the Grid by selecting files,
  dragging and dropping files or URLs, importing Witness contributions, and
  then completing the required metadata while tracking each upload's progress.

  Background:
    Given the application stack is running
    And I have opened the image upload page

  # ---------------------------------------------------------------------------
  # Upload page shell (view.html + controller.js)
  # ---------------------------------------------------------------------------

  Scenario: An authorised user sees the upload tools
    Given I am permitted to upload images
    When the upload page loads
    Then I should see the file upload prompt
    And I should see my past 50 uploads
    And the drag-and-drop uploader should be active
  # Evidence: kahuna/public/js/upload/view.html lines 11-12, 19-27, 31
  # Evidence: kahuna/public/js/upload/controller.js lines 40-45

  # Needs a stack booted with enforceUploadImagesPermission=true.
  @todo
  Scenario: An unauthorised user is told they cannot upload
    Given I am not permitted to upload images
    When the upload page loads
    Then I should see a message that I am not authorised to upload images
    And I should see a link to email support
    And I should not see the file upload prompt
    And I should not see the drag-and-drop uploader
  # Evidence: kahuna/public/js/upload/view.html lines 11, 29
  # Evidence: kahuna/public/js/upload/controller.js lines 36-41

  Scenario: Returning to search from the upload page
    When I choose "Back to search" from the top bar
    Then I should be taken to the image search page
    And my previous search should be intact
  # Evidence: kahuna/public/js/upload/view.html lines 3-6

  Scenario: The current uploads section only appears while an upload is running
    Given I have an upload in progress
    When the upload page loads
    Then I should see my current uploads section
  # Evidence: kahuna/public/js/upload/view.html lines 14-17
  # Evidence: kahuna/public/js/upload/controller.js lines 45

  Scenario: Viewing all of my uploads
    When I choose "View all your uploads"
    Then I should be taken to a search filtered to images I uploaded
  # Evidence: kahuna/public/js/upload/view.html lines 22-23

  # Currently unreachable: ui-router destroys the UploadCtrl scope before broadcasting
  # $locationChangeStart, so the controller's warning listener never runs on a ui-sref click.
  @todo
  Scenario: Warning before leaving the page with uploads in progress
    Given I have an upload in progress
    When I try to navigate away from the upload page via the following buttons:
      | Back to search |
      | Home |
      | View all your uploads |
    Then I should be warned that uploads are in progress and asked to confirm
  # Evidence: kahuna/public/js/upload/controller.js lines 18-34, 47-54

  # ---------------------------------------------------------------------------
  # File upload prompt (prompt/prompt.html + prompt.js)
  # ---------------------------------------------------------------------------

  Scenario: The prompt explains how to upload
    When the upload page loads
    Then I should see a message telling me to drag and drop or click to upload to the system
  # Evidence: kahuna/public/js/upload/prompt/prompt.html lines 1-3
  # Evidence: kahuna/public/js/upload/prompt/prompt.js lines 20

  # Currently unreachable: prompt.html guards the example label with `ctrl.presetLabels`,
  # but filePrompt has an isolated scope and no controller, so `ctrl` is always undefined.
  @todo
  Scenario: The prompt suggests an example label when no labels are applied
    Given I have not applied any preset labels
    When the upload page loads
    Then I should see a suggested example label to apply to all uploads
  # Evidence: kahuna/public/js/upload/prompt/prompt.html lines 5-11
  # Evidence: kahuna/public/js/upload/prompt/prompt.js lines 21

  @todo
  Scenario: Preset labels are applied to all uploads
    When I add a preset label in the prompt
    Then that label should be applied to all my uploads
  # Evidence: kahuna/public/js/upload/prompt/prompt.html lines 5-11
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 43, 113-114

  @todo
  Scenario: Preset labels are stored in local storage
    When I add preset label(s) in the prompt
    Then those label(s) should already be selected when I reload the page

  # ---------------------------------------------------------------------------
  # Select-files uploader (file-uploader.html + file-uploader.js)
  # ---------------------------------------------------------------------------

  Scenario: Opening the file picker from the Upload button
    When I click the "Upload" button
    Then the system file picker should open
  # Evidence: kahuna/public/js/upload/file-uploader.html lines 9-15
  # Evidence: kahuna/public/js/upload/file-uploader.js lines 41-42

  Scenario: Selecting files queues them for upload
    When I select one or more image files to upload
    Then those files should be queued for upload
    And I should be taken to the upload progress view
  # Evidence: kahuna/public/js/upload/file-uploader.html lines 4-7
  # Evidence: kahuna/public/js/upload/file-uploader.js lines 20-26
  # Evidence: kahuna/public/js/upload/manager.js lines 68-83

  Scenario: Files above the size limit are skipped with a warning
    Given an upload size limit is configured
    When I select a file that is larger than the size limit
    Then I should be warned that the oversized file will be skipped
    And only the files within the limit should be queued for upload
  # Evidence: kahuna/public/js/upload/manager.js lines 36-47

  # ---------------------------------------------------------------------------
  # Drag-and-drop uploader (dnd-uploader.html + dnd-uploader.js)
  # ---------------------------------------------------------------------------

  @todo
  Scenario: Dragging valid content over the page shows the dropzone
    When I drag files over the upload page
    Then the dropzone overlay should appear with an explanation
  # Evidence: kahuna/public/js/upload/dnd-uploader.html lines 1-6
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 113, 116, 158-171

  @todo
  Scenario: The dropzone hides when I stop dragging
    Given the dropzone overlay is showing
    When I drag away from the upload page
    Then the dropzone overlay should disappear
  # Evidence: kahuna/public/js/upload/dnd-uploader.html lines 1
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 117, 173-180

  @todo
  Scenario: Dropping files uploads them
    When I drop one or more image files onto the page
    Then those files should be queued for upload
    And I should be taken to the upload progress view
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 33-37, 182-205
  # Evidence: kahuna/public/js/upload/manager.js lines 68-83

  @todo
  Scenario: Dropping a URL loads the image from that URL
    When I drop an image URL onto the page
    Then the image at that URL should be loaded for upload
    And I should be taken to the upload progress view
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 64-66, 219-220
  # Evidence: kahuna/public/js/upload/manager.js lines 86-96

  @todo
  Scenario: Dropping a Witness contribution imports it
    When I drop a Witness contribution URL onto the page
    Then the importing overlay should be shown
    And the Witness image should be imported with its metadata and usage rights
    And I should be taken to the imported image's page
  # Evidence: kahuna/public/js/upload/dnd-uploader.html lines 8-12
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 40-62, 69-78, 206-217

  @todo
  Scenario: A failed Witness import is reported
    Given I drop a Witness contribution URL onto the page
    When the Witness import fails
    Then I should see an alert that importing the Witness contribution failed
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 79-85

  @todo
  Scenario: Dropping invalid content is rejected
    When I drop something that is not a valid file or URL
    Then I should see an alert that I must drop valid files or URLs
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 222-231

  @todo
  Scenario: Dragging a Grid image back onto the page is ignored
    When I drag an image that is already in the Grid over the page
    Then the dropzone overlay should not appear
  # Evidence: kahuna/public/js/upload/dnd-uploader.js lines 135-150, 158-160

  # ---------------------------------------------------------------------------
  # Current uploads list (jobs/upload-jobs.html + upload-jobs.js)
  # ---------------------------------------------------------------------------

  @todo
  Scenario: Current uploads show how many remain
    Given I have several uploads in progress
    When I view my current uploads
    Then I should see a count of how many uploads remain
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 2
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 45, 79, 88

  @todo
  Scenario: An uploading job shows a preview with its name and size
    Given a file is uploading
    When I view my current uploads
    Then I should see a preview thumbnail with the file name and size
    And I should see the job's status
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 9-31
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 61-72
  # Evidence: kahuna/public/js/upload/manager.js lines 16-21

  @todo
  Scenario: A failed upload shows the error and can be removed
    Given an upload has failed
    When I view my current uploads
    Then the job should be marked as an upload error with the error message
    And I should be able to remove the failed job after confirming
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 24-38
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 77-78, 179-185

  @todo
  Scenario: An unsupported file type gives a helpful error
    When I upload a file that is not a JPG, PNG or TIFF
    Then the job should show an error explaining only JPG, PNG and TIFF are supported
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 155-163

  @todo
  Scenario: A completed upload becomes an editable image
    Given an upload has completed
    When I view my current uploads
    Then the job should switch to the image metadata editor
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html lines 40-48
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 84-92

  @todo
  Scenario: A missing description defaults to the file name
    Given an uploaded image has no description
    When the upload completes
    Then the description should default to the file name without its extension
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 105-110

  @todo
  Scenario: Deleting an image removes it from current uploads
    Given an uploaded image is shown in my current uploads
    When the image is deleted
    Then it should be removed from my current uploads
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 187-195

  @todo
  Scenario: Uploading a previously deleted image displays it for undeletion
    Given an image is uploaded
    And then deleted
    And the same image is uploaded again
    And I have delete permission
    Then it should be present in my current uploads
    And I should be able to undelete it
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 187-195

  # Existing bug: the UI still presents this button even if permission to delete is not present
  @todo
  Scenario: Uploading a previously deleted image uploaded by a different user does not display undeletion button without the appropriate permission
    Given an image is uploaded by a user that is not me
    And then deleted
    And the same image is uploaded again by me
    And I do not have delete permissions
    Then it should be present in current uploads
    And I should see the undelete button
    And the undelete button is disabled
    And there should be a message indicating that I do not have permission to undelete
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 187-195

  @todo
  Scenario: A failed deletion is reported
    Given an uploaded image is shown in my current uploads
    When deleting the image fails
    Then I should see an alert explaining the deletion failed
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js lines 197-203

  # ---------------------------------------------------------------------------
  # Required metadata editor (jobs/required-metadata-editor.html + .js)
  # ---------------------------------------------------------------------------

  @todo
  Scenario: Editing required metadata for an uploaded image
    Given an uploaded image is shown in the metadata editor
    When I fill in the description, byline and credit
    Then the metadata should be saved automatically
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 1, 30-56, 61-72, 85-104
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 33, 40-65

  @todo
  Scenario: Description and credit are required
    Given an uploaded image is shown in the metadata editor
    When I leave the description or credit empty
    Then those fields should be marked as required
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 36, 96

  @todo
  Scenario: The description placeholder gives guidance
    Given an uploaded image with no description
    When I view the description field
    Then I should see placeholder guidance about who, what, where, when and why
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 34-40
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 157-161

  # How to verify writes?
  @todo
  Scenario: Choosing an image type when image types are configured
    Given image types are configured
    When I view the metadata editor
    Then I should be able to choose an image type from a dropdown
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 5-27
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 38

  @todo
  Scenario: The credit field suggests existing values
    Given an uploaded image is shown in the metadata editor
    When I type into the credit field
    Then I should see suggestions matching existing credits
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 87-104
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 67-71

  # How to verify writes?
  @todo
  Scenario: Metadata only shows when it was already present for some fields
    Given an uploaded image that already has metadata values for the following fields:
      | byline |
      | credit |
      | copyright |
      | specialInstructions |
      | description |
      | domainMetadata |
      | usageInstructions |
      | imageType |
    When I view the metadata editor
    Then I should see the metadata values in the appropriate fields
    And I should be able to edit those fields with other values
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 114-134
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 36

  @todo
  Scenario: Applying a field value to all current uploads in a batch
    Given I am uploading more than one image
    And I am permitted to edit
    When I apply the following field values to all current uploads:
      | Leases |
      | Image type |
      | Description |
      | Byline |
      | Credit |
      | Special instructions |
      | Collections |
      | Labels |
      | Keywords |
      | Photoshoot |
    Then that value should be applied to the same field on every current upload
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 20-27, 49-53, 76-80, 107-111, 129-133, 156-160, 179-183
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 108-119

  @todo
  Scenario: Metadata editing is disabled without edit permission
    Given I am not permitted to edit the image
    When I view the metadata editor for an image I did not upload
    Then the metadata fields should be disabled
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 14, 44, 71, 101, 124, 152, 173
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 27-29

  # This requires configuration, which is already present in CODE
  @todo
  Scenario: Applying a metadata template makes fields read-only
    Given an uploaded image is shown in the metadata editor
    When a metadata template is selected
    Then the affected fields should be populated and made read-only
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html lines 15, 45, 72, 102, 125, 153, 175
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js lines 84-98

  @todo
  Scenario: Removing a metadata template restores previously edited fields
    Given an uploaded image is shown in the metadata editor
    And a field is edited
    When a metadata template is selected and then removed
    Then the previously overridden fields are restored

  # ---------------------------------------------------------------------------
  # Recent uploads (recent/recent-uploads.html + recent-uploads.js)
  # ---------------------------------------------------------------------------

  @todo
  Scenario: Past uploads are loading
    When my past uploads have not yet loaded
    Then I should see a loading message
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.html lines 1-2
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js lines 34

  @todo
  Scenario: I have not uploaded anything yet
    Given I have never uploaded an image
    When my past uploads load
    Then I should see a message that I haven't uploaded anything yet
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.html lines 4-5
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js lines 25-34

  @todo
  Scenario: My past uploads are listed
    Given I have uploaded images before
    When my past uploads load
    Then I should see each of my past uploaded images
    And I should be able to delete an image I am permitted to delete
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.html lines 7-13
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js lines 25-51

  @todo
  Scenario: A failed deletion of a past upload is reported
    Given a past uploaded image is listed
    When deleting the image fails
    Then I should see an alert explaining the deletion failed
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js lines 63-69
