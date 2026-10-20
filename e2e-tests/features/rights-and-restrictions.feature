Feature: Viewing and editing an image's rights and restrictions in the single image view
  This lets a user see the usage rights category of the image they are viewing, with
  an optional at-a-glance usage summary, and lets users who may edit the image change
  those rights or preview the rights a metadata template would apply.

  Background:
    Given the application stack is running
    And I have opened the single image view of an image

  # ---------------------------------------------------------------------------
  # Section shell
  # ---------------------------------------------------------------------------
  @todo
  Scenario: The rights and restrictions section is shown on the Metadata tab
    Then the Metadata tab is selected
    And I see a "Rights and restrictions" region
    And it is headed "Rights & restrictions"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 17-19
  # Evidence: kahuna/public/js/image/view.html lines 166-172
  # Evidence: kahuna/public/js/image/controller.js lines 154-159, 178
  # Evidence: kahuna/public/js/image/index.js lines 25-28

  # ---------------------------------------------------------------------------
  # Category display (usage rights summary switched off)
  # ---------------------------------------------------------------------------
@todo
  Scenario: The category name is shown for an image with usage rights
    Given the usage rights summary is switched off
    And the image has the "Agency - subscription" usage rights category
    Then the rights and restrictions section shows "Agency - subscription"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 29-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 63, 69-73, 446-472
  # Evidence: kahuna/app/views/main.scala.html lines 93
  # Evidence: kahuna/app/lib/KahunaConfig.scala lines 50
@todo
  Scenario: The mapped category name is shown for an image with a legacy usage right
    Given the usage rights summary is switched off
    And the image has the "chargeable" usage rights category
    And the configuration contains pay-to-use and not chargeable
    Then the rights and restrictions section shows "Pay to use"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 29-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 63, 69-73, 446-472
  # Evidence: kahuna/app/views/main.scala.html lines 93
  # Evidence: kahuna/app/lib/KahunaConfig.scala lines 50
@todo
  Scenario: The mapped category name and fields are shown for an image with a legacy usage rights and a suppliers field
    Given the image has the "composite" usage rights category
    And the usage rights suppliers is "Alamy, Getty Images"
    And the configuration contains pay-to-use and not chargeable
    Then the rights and restrictions section shows "PR & Third Party"
    And Source field is "Alamy, Getty Images"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 29-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 63, 69-73, 446-472
  # Evidence: kahuna/app/views/main.scala.html lines 93
  # Evidence: kahuna/app/lib/KahunaConfig.scala lines 50

  Scenario: An image without a usage rights category is shown as Unknown
    Given the usage rights summary is switched off
    And the image has no usage rights category
    Then the rights and restrictions section shows "Unknown"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 30-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 462-472
@todo
  Scenario: No usage icons are shown when the usage rights summary is switched off
    Given the usage rights summary is switched off
    And the image is payable
    Then the rights and restrictions section shows only the category
    And no usage rights summary is shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 30-37
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 63
  # Evidence: kahuna/app/views/main.scala.html lines 93

  # ---------------------------------------------------------------------------
  # Usage rights summary (switched on)
  # ---------------------------------------------------------------------------
@todo
  Scenario: The usage rights summary shows the category name
    Given the usage rights summary is switched on
    And the image has the "Agency - subscription" usage rights category
    Then the usage rights summary shows "Agency - subscription"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 33-37
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 63, 543-557
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx lines 89-91, 107-110
@todo
  Scenario: The usage rights summary shows Unknown for an image without a category
    Given the usage rights summary is switched on
    And the image has no usage rights category
    Then the usage rights summary shows "Unknown"
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx lines 89-91, 109
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 543-557
@todo
  Scenario Outline: The usage rights summary lists the usage that applies to the image
    Given the usage rights summary is switched on
    And the image is <image>
    Then the usage rights summary lists "<usage>" with its icon

    # title-format: The summary lists "<usage>" for an image that is <image>
    Examples:
      | image                                                | usage            |
      | payable                                              | Payable images   |
      | unrestricted, free and credited to the BBC           | Usable for all   |
      | free and in the "agency" usage rights category       | Usable for News  |
      | free and has the usage rights supplier "PA"          | Usable for Sport |
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 33-37
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx lines 17, 52-87, 113-129
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-bbc.tsx lines 46-129
@todo
  Scenario: The usage rights summary lists nothing when no usage applies
    Given the usage rights summary is switched on
    And the image is free, unrestricted and not credited to the BBC
    And the image is not in the "agency" usage rights category
    Then the usage rights summary lists no usage
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx lines 52-87, 113-129
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-bbc.tsx lines 46-108
@todo
  Scenario: The usage rights summary shows the supplier's agency marker
    Given the usage rights summary is switched on
    And the image was uploaded by "PA_AutoIngest"
    Then the usage rights summary shows an agency marker titled "PA_AutoIngest"
  # It's ok to target a css class here because non-Guardian orgs supply stylesheets that provide the appropriate imagary  
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx lines 93-105, 110-112

  # ---------------------------------------------------------------------------
  # Edit permission
  # ---------------------------------------------------------------------------
@todo
  Scenario: A user with edit permission can edit the image's rights
    Given I am signed in with edit metadata permission
    And the image was uploaded by someone else
    Then the edit rights and restrictions button is shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 40-44
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 658
  # Evidence: kahuna/public/js/image/view.html lines 169-172
  # Evidence: kahuna/public/js/image/controller.js lines 180-182
  # Evidence: kahuna/public/js/edits/service.js lines 244-247
  # Evidence: media-api/app/controllers/MediaApi.scala lines 814
  # Evidence: media-api/app/lib/ImageResponse.scala lines 148
  # Evidence: rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala lines 62-74
@todo
  Scenario: A user without edit permission cannot edit another user's image rights
    Given I am signed in without edit metadata permission
    And the image was uploaded by someone else
    Then the edit rights and restrictions button is not shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 40-44
  # Evidence: kahuna/public/js/image/controller.js lines 180-182
  # Evidence: kahuna/public/js/edits/service.js lines 244-247
  # Evidence: media-api/app/controllers/MediaApi.scala lines 814
  # Evidence: rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala lines 62-74
@todo
  Scenario: The uploader can edit their own image's rights without edit permission
    Given I am signed in without edit metadata permission
    And the image was uploaded by me
    Then the edit rights and restrictions button is shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 40-44
  # Evidence: media-api/app/controllers/MediaApi.scala lines 814
  # Evidence: rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala lines 62-69

  # ---------------------------------------------------------------------------
  # Editing rights
  # ---------------------------------------------------------------------------
@todo
  Scenario: The rights editor is closed by default
    Given I am signed in with edit metadata permission
    Then the rights editor is not shown
    And the current usage rights category is shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-29
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 62
@todo
  Scenario: Opening the rights editor replaces the category display
    Given I am signed in with edit metadata permission
    When I choose to edit the rights and restrictions
    Then the rights editor is shown
    And the current usage rights category display is hidden
    And the edit rights and restrictions button is hidden
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-29, 40-44
@todo
  Scenario: Saving new rights closes the editor and shows the new category
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I save the "Agency - subscription" usage rights category
    Then the rights editor closes
    And the rights and restrictions section shows "Agency - subscription"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-32
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 175-189, 201-218, 285-289
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 69-73, 167-172
@todo
  Scenario: Cancelling the rights editor leaves the rights unchanged
    Given I am signed in with edit metadata permission
    And the image has the "Agency - subscription" usage rights category
    And I have opened the rights editor
    When I cancel the rights editor
    Then the rights editor closes
    And the rights and restrictions section shows "Agency - subscription"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-32
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 196, 287
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 210-215
@todo # TODO - Add in GNM owned photograph when merged
  Scenario Outline: Editing a rights category shows its configured properties
    Given I am signed in with edit metadata permission
    And I have opened the rights editor
    When I select the "<category>" usage rights category
    Then the rights editor shows the "<property>" property as <required>
    And the rights editor shows the "Restricted" checkbox <restricted>

    # A category whose default cost is conditional requires restrictions, so the
    # "Restricted" checkbox is ticked automatically and cannot be unticked.
    Examples:
      | category                    | property      | required | restricted        |
      | Agency - subscription       | Supplier      | required | unticked          |
      | Agency - subscription       | Collection    | optional | unticked          |
      | PR & Third Party            | Source        | required | ticked and locked |
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 74-77 (restrictions required when defaultCost is Conditional)
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala (defaultCost per category)
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 73-84
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 109-137
  # Evidence: e2e-tests/setup/config.ts (usageRights.applicable)
@todo
  Scenario Outline: Editing a rights category without properties shows no category fields
    Given I am signed in with edit metadata permission
    And I have opened the rights editor
    When I select the "<category>" usage rights category
    Then the rights editor shows no category properties

    Examples:
      | category      |
      | Unknown Rights |
      | Pay to use     |
      | Bylines        |
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala
  # Evidence: e2e-tests/setup/config.ts (usageRights.applicable)
@todo # TODO - Add in GNM owned photograph when merged  
  Scenario Outline: Saving a rights category with its properties filled in
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I select the "Agency - subscription" usage rights category and set configured fields
    And I save the rights
    Then the rights editor closes
    And the rights and restrictions section shows "<category>"
    When I choose to edit the rights and restrictions
    Then the rights editor shows the configured fields

  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 74-77 (restrictions offered for every category except NoRights)
  # Evidence: dev/script/generate-config/service-config.js lines 54-83 (usageRightsConfigProvider options)
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 5, 38-226 (restrictions checkbox and textarea lines 73-107)
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 109-137, 160-189, 201-218
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-32
@todo
  Scenario: Saving a rights category that requires restrictions
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I select the "PR & Third Party" usage rights category
    And I set the "Source" property to "Getty Images"
    And I add the restriction "Not to be used online"
    And I save the rights
    Then the rights editor closes
    And the rights and restrictions section shows "PR & Third Party"
    When I choose to edit the rights and restrictions
    Then the rights editor shows the "Source" property set to "Getty Images"
    And the rights editor shows the restriction "Not to be used online"
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 74-77, 147-149
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 73-107
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 109-130

  # ---------------------------------------------------------------------------
  # Metadata templates driving the rights editor
  # ---------------------------------------------------------------------------
@todo
  Scenario: Choosing a template with a different category previews its rights
    Given I am signed in with edit metadata permission
    And metadata templates are configured
    And the image has no usage rights category
    When I choose a metadata template that sets a usage rights category
    Then the rights editor shows the template's usage rights as a locked preview
    And the rights editor offers no save or cancel buttons
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 2-15, 21-27
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 565-570, 596-606
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 4, 24, 210
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 289
@todo
  Scenario: Choosing a template with the same category keeps the rights editor closed
    Given I am signed in with edit metadata permission
    And metadata templates are configured
    And the image has the "Agency - subscription" usage rights category
    When I choose a metadata template that sets the "Agency - subscription" usage rights category
    Then the rights editor is not shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-29
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 565-570, 596-601
@todo
  Scenario: Applying a template closes the rights preview
    Given I am signed in with edit metadata permission
    And metadata templates are configured
    And a metadata template's usage rights are being previewed on the image
    When I apply the metadata template
    Then the rights editor closes
    And the rights and restrictions section shows the template's usage rights category
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 10-11, 21-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 615-622
@todo
  Scenario: Cancelling a template restores the original rights
    Given I am signed in with edit metadata permission
    And metadata templates are configured
    And the image has no usage rights category
    And a metadata template's usage rights are being previewed on the image
    When I cancel the metadata template
    Then the rights editor closes
    And the rights and restrictions section shows "Unknown"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 12, 21-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 624-632
