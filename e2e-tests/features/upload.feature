Feature: Uploading images to the Grid
  This lets an authorised user get images into the Grid by selecting files,
  dragging and dropping files or URLs, importing Witness contributions, and
  then completing the required metadata while tracking each upload's progress.

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
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
  # Evidence: kahuna/public/js/upload/view.html
  # Evidence: kahuna/public/js/upload/controller.js

  Scenario: An unauthorised user is told they cannot upload
    Given I am not permitted to upload images
    When the upload page loads
    Then I should see a message that I am not authorised to upload images
    And I should see a link to email support
    And I should not see the file upload prompt
  # Evidence: kahuna/public/js/upload/view.html
  # Evidence: kahuna/public/js/upload/controller.js

  Scenario: Returning to search from the upload page
    When I choose "Back to search" from the top bar
    Then I should be taken to the image search page
  # Evidence: kahuna/public/js/upload/view.html

  Scenario: The current uploads section only appears while an upload is running
    Given I have an upload in progress
    When the upload page loads
    Then I should see my current uploads section
  # Evidence: kahuna/public/js/upload/view.html
  # Evidence: kahuna/public/js/upload/controller.js

  Scenario: Viewing all of my uploads
    When I choose "View all your uploads"
    Then I should be taken to a search filtered to images I uploaded
  # Evidence: kahuna/public/js/upload/view.html

  Scenario: Warning before leaving the page with uploads in progress
    Given I have an upload in progress
    When I try to navigate away from the upload page
    Then I should be warned that uploads are in progress and asked to confirm
  # Evidence: kahuna/public/js/upload/controller.js

  # ---------------------------------------------------------------------------
  # File upload prompt (prompt/prompt.html + prompt.js)
  # ---------------------------------------------------------------------------

  Scenario: The prompt explains how to upload
    When the upload page loads
    Then I should see a message telling me to drag and drop or click to upload to the system
  # Evidence: kahuna/public/js/upload/prompt/prompt.html
  # Evidence: kahuna/public/js/upload/prompt/prompt.js

  Scenario: The prompt suggests an example label when no labels are applied
    Given I have not applied any preset labels
    When the upload page loads
    Then I should see a suggested example label to apply to all uploads
  # Evidence: kahuna/public/js/upload/prompt/prompt.html
  # Evidence: kahuna/public/js/upload/prompt/prompt.js

  Scenario: Preset labels are applied to all uploads
    When I add a preset label in the prompt
    Then that label should be applied to all my uploads
  # Evidence: kahuna/public/js/upload/prompt/prompt.html
  # Evidence: kahuna/public/js/upload/prompt/prompt.js
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  # ---------------------------------------------------------------------------
  # Select-files uploader (file-uploader.html + file-uploader.js)
  # ---------------------------------------------------------------------------

  Scenario: Opening the file picker from the Upload button
    When I click the "Upload" button
    Then the system file picker should open
  # Evidence: kahuna/public/js/upload/file-uploader.html
  # Evidence: kahuna/public/js/upload/file-uploader.js

  Scenario: Selecting files queues them for upload
    When I select one or more image files to upload
    Then those files should be queued for upload
    And I should be taken to the upload progress view
  # Evidence: kahuna/public/js/upload/file-uploader.html
  # Evidence: kahuna/public/js/upload/file-uploader.js
  # Evidence: kahuna/public/js/upload/manager.js

  Scenario: Files above the size limit are skipped with a warning
    Given an upload size limit is configured
    When I select a file that is larger than the size limit
    Then I should be warned that the oversized file will be skipped
    And only the files within the limit should be queued for upload
  # Evidence: kahuna/public/js/upload/manager.js

  # ---------------------------------------------------------------------------
  # Drag-and-drop uploader (dnd-uploader.html + dnd-uploader.js)
  # ---------------------------------------------------------------------------

  Scenario: Dragging valid content over the page shows the dropzone
    When I drag files over the upload page
    Then the dropzone overlay should appear with an explanation
  # Evidence: kahuna/public/js/upload/dnd-uploader.html
  # Evidence: kahuna/public/js/upload/dnd-uploader.js

  Scenario: The dropzone hides when I stop dragging
    Given the dropzone overlay is showing
    When I drag away from the upload page
    Then the dropzone overlay should disappear
  # Evidence: kahuna/public/js/upload/dnd-uploader.html
  # Evidence: kahuna/public/js/upload/dnd-uploader.js

  Scenario: Dropping files uploads them
    When I drop one or more image files onto the page
    Then those files should be queued for upload
    And I should be taken to the upload progress view
  # Evidence: kahuna/public/js/upload/dnd-uploader.js
  # Evidence: kahuna/public/js/upload/manager.js

  Scenario: Dropping a URL loads the image from that URL
    When I drop an image URL onto the page
    Then the image at that URL should be loaded for upload
    And I should be taken to the upload progress view
  # Evidence: kahuna/public/js/upload/dnd-uploader.js
  # Evidence: kahuna/public/js/upload/manager.js

  Scenario: Dropping a Witness contribution imports it
    When I drop a Witness contribution URL onto the page
    Then the importing overlay should be shown
    And the Witness image should be imported with its metadata and usage rights
    And I should be taken to the imported image's page
  # Evidence: kahuna/public/js/upload/dnd-uploader.html
  # Evidence: kahuna/public/js/upload/dnd-uploader.js

  Scenario: A failed Witness import is reported
    Given I drop a Witness contribution URL onto the page
    When the Witness import fails
    Then I should see an alert that importing the Witness contribution failed
  # Evidence: kahuna/public/js/upload/dnd-uploader.js

  Scenario: Dropping invalid content is rejected
    When I drop something that is not a valid file or URL
    Then I should see an alert that I must drop valid files or URLs
  # Evidence: kahuna/public/js/upload/dnd-uploader.js

  Scenario: Dragging a Grid image back onto the page is ignored
    When I drag an image that is already in the Grid over the page
    Then the dropzone overlay should not appear
  # Evidence: kahuna/public/js/upload/dnd-uploader.js

  # ---------------------------------------------------------------------------
  # Current uploads list (jobs/upload-jobs.html + upload-jobs.js)
  # ---------------------------------------------------------------------------

  Scenario: Current uploads show how many remain
    Given I have several uploads in progress
    When I view my current uploads
    Then I should see a count of how many uploads remain
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  Scenario: An uploading job shows a preview with its name and size
    Given a file is uploading
    When I view my current uploads
    Then I should see a preview thumbnail with the file name and size
    And I should see the job's status
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js
  # Evidence: kahuna/public/js/upload/manager.js

  Scenario: A failed upload shows the error and can be removed
    Given an upload has failed
    When I view my current uploads
    Then the job should be marked as an upload error with the error message
    And I should be able to remove the failed job after confirming
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  Scenario: An unsupported file type gives a helpful error
    When I upload a file that is not a JPG, PNG or TIFF
    Then the job should show an error explaining only JPG, PNG and TIFF are supported
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  Scenario: A completed upload becomes an editable image
    Given an upload has completed
    When I view my current uploads
    Then the job should switch to the image metadata editor
    And I should be able to delete the image if I am permitted
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.html
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  Scenario: A missing description defaults to the file name
    Given an uploaded image has no description
    When the upload completes
    Then the description should default to the file name without its extension
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  Scenario: Deleting an image removes it from current uploads
    Given an uploaded image is shown in my current uploads
    When the image is deleted
    Then it should be removed from my current uploads
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  Scenario: A failed deletion is reported
    Given an uploaded image is shown in my current uploads
    When deleting the image fails
    Then I should see an alert explaining the deletion failed
  # Evidence: kahuna/public/js/upload/jobs/upload-jobs.js

  # ---------------------------------------------------------------------------
  # Required metadata editor (jobs/required-metadata-editor.html + .js)
  # ---------------------------------------------------------------------------

  Scenario: Editing required metadata for an uploaded image
    Given an uploaded image is shown in the metadata editor
    When I fill in the description, byline and credit
    Then the metadata should be saved automatically
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  Scenario: Description and credit are required
    Given an uploaded image is shown in the metadata editor
    When I leave the description or credit empty
    Then those fields should be marked as required
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html

  Scenario: The description placeholder gives guidance
    Given an uploaded image with no description
    When I view the description field
    Then I should see placeholder guidance about who, what, where, when and why
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  Scenario: Choosing an image type when image types are configured
    Given image types are configured
    When I view the metadata editor
    Then I should be able to choose an image type from a dropdown
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  Scenario: The credit field suggests existing values
    Given an uploaded image is shown in the metadata editor
    When I type into the credit field
    Then I should see suggestions matching existing credits
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  Scenario: Copyright only shows when it was already present
    Given an uploaded image that already has a copyright value
    When I view the metadata editor
    Then I should see the copyright field
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  Scenario: Existing usage instructions are shown with room for more
    Given an uploaded image that already has usage instructions
    When I view the metadata editor
    Then I should see the existing usage instructions
    And I should be able to add further special instructions
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html

  Scenario: Applying a field value to all uploads in a batch
    Given I am uploading more than one image
    And I am permitted to edit
    When I apply a field value to all uploads
    Then that value should be applied to the same field on every current upload
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  Scenario: Metadata editing is disabled without edit permission
    Given I am not permitted to edit the image
    When I view the metadata editor
    Then the metadata fields should be disabled
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  Scenario: Applying a metadata template makes fields read-only
    Given an uploaded image is shown in the metadata editor
    When a metadata template is selected
    Then the affected fields should be populated and made read-only
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.html
  # Evidence: kahuna/public/js/upload/jobs/required-metadata-editor.js

  # ---------------------------------------------------------------------------
  # Recent uploads (recent/recent-uploads.html + recent-uploads.js)
  # ---------------------------------------------------------------------------

  Scenario: Past uploads are loading
    When my past uploads have not yet loaded
    Then I should see a loading message
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.html
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js

  Scenario: I have not uploaded anything yet
    Given I have never uploaded an image
    When my past uploads load
    Then I should see a message that I haven't uploaded anything yet
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.html
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js

  Scenario: My past uploads are listed
    Given I have uploaded images before
    When my past uploads load
    Then I should see each of my past uploaded images
    And I should be able to delete an image I am permitted to delete
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.html
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js

  Scenario: A failed deletion of a past upload is reported
    Given a past uploaded image is listed
    When deleting the image fails
    Then I should see an alert explaining the deletion failed
  # Evidence: kahuna/public/js/upload/recent/recent-uploads.js
