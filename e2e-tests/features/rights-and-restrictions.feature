Feature: Viewing and editing an image's rights and restrictions in the single image view
  This lets a user see the usage rights category of the image they are viewing, with
  an optional at-a-glance usage summary, and lets users who may edit the image change
  those rights or preview the rights a metadata template would apply.

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth
    And I have opened the single image view of an image

  # ---------------------------------------------------------------------------
  # Section shell
  # ---------------------------------------------------------------------------

  Scenario: The rights and restrictions section is shown on the Metadata tab
    Then the Metadata tab is selected
    And I see a "Rights and restrictions" region
    And it is headed "Rights & restrictions"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 17-19
  # Evidence: kahuna/public/js/image/view.html lines 166-172
  # Evidence: kahuna/public/js/image/controller.js lines 154-159, 178
  # Evidence: kahuna/public/js/image/index.js lines 25-28

  Scenario: The category name is shown for an image with usage rights
    Given the image has the "Agency - subscription" usage rights category
    Then the rights and restrictions section shows "Agency - subscription"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 29-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 63, 69-73, 446-472
  # Evidence: kahuna/app/views/main.scala.html lines 93
  # Evidence: kahuna/app/lib/KahunaConfig.scala lines 50

  Scenario: The mapped category name is shown for an image with a legacy usage right
    Given the image has the "chargeable" usage rights category
    And the configuration contains pay-to-use and not chargeable
    Then the rights and restrictions section shows "Pay to use"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 29-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 63, 69-73, 446-472
  # Evidence: kahuna/app/views/main.scala.html lines 93
  # Evidence: kahuna/app/lib/KahunaConfig.scala lines 50

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
    Given the image has no usage rights category
    Then the rights and restrictions section shows "Unknown"
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 30-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 462-472
  
  # ---------------------------------------------------------------------------
  # Category display (usage rights summary switched off)
  # ---------------------------------------------------------------------------

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

  Scenario: The usage rights summary lists nothing when no usage applies
    Given the usage rights summary is switched on
    And the image is free, unrestricted and not credited to the BBC
    And the image is not in the "agency" usage rights category
    Then the usage rights summary lists no usage
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx lines 52-87, 113-129
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-bbc.tsx lines 46-108

  Scenario: The usage rights summary shows the supplier's agency marker
    Given the usage rights summary is switched on
    And the image was uploaded by "PA_AutoIngest"
    Then the usage rights summary shows an agency marker titled "PA_AutoIngest"
  # It's ok to target a css class here because non-Guardian orgs supply stylesheets that provide the appropriate imagary  
  # Evidence: kahuna/public/js/components/gr-usagerights-summary/gr-usagerights-summary.tsx lines 93-105, 110-112

  # ---------------------------------------------------------------------------
  # Edit permission
  # ---------------------------------------------------------------------------

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

  Scenario: A user without edit permission cannot edit another user's image rights
    Given I am signed in without edit metadata permission
    And the image was uploaded by someone else
    Then the edit rights and restrictions button is not shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 40-44
  # Evidence: kahuna/public/js/image/controller.js lines 180-182
  # Evidence: kahuna/public/js/edits/service.js lines 244-247
  # Evidence: media-api/app/controllers/MediaApi.scala lines 814
  # Evidence: rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala lines 62-74

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

  Scenario: The rights editor is closed by default
    Given I am signed in with edit metadata permission
    Then the rights editor is not shown
    And the current usage rights category is shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-29
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 62

  Scenario: Opening the rights editor replaces the category display
    Given I am signed in with edit metadata permission
    When I choose to edit the rights and restrictions
    Then the rights editor is shown
    And the current usage rights category display is hidden
    And the edit rights and restrictions button is hidden
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-29, 40-44

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

  # ---------------------------------------------------------------------------
  # Editing each configured usage rights category
  # ---------------------------------------------------------------------------
  # The categories come from `usageRights.applicable` in the e2e config, which swaps
  # Chargeable for PayToUse and does not enable the Programmes categories. Each category's
  # extra fields come from UsageRightsProperty, and the dev config supplies their options
  # (free suppliers, publications, photographers, illustrators and Creative Commons licences).
  # An option list of three or fewer is shown as radio buttons and a longer one as a dropdown.

  @todo
  Scenario Outline: Choosing a category shows its caution
    Given I am signed in with edit metadata permission
    And I have opened the rights editor
    When I choose the "<category>" usage rights category
    Then the rights editor shows the caution "<caution>"

    Examples:
      | category         | caution                                                                           |
      | Unknown Rights   | You cannot use this image in content!                                             |
      | PR Image         | For use only within the context originally provided for (please state it below).  |
      | Handout          | For use only within the context originally provided for (please state it below).  |
      | Social Media     | Approval needed from senior editor if permission from owner cannot be acquired    |
      | Creative Commons | This only applies to COMMERCIAL creative commons licences.                        |
      | Composite        | All images should be free to use, or restrictions applied                         |
      | Public Domain    | ONLY use if you are certain the image is out of copyright or bequeathed to public |
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 171-172, 279-280, 298-299, 364-365, 537, 554, 570
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 30-32

  @todo
  Scenario Outline: Saving a category that needs no further details
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "<category>" usage rights category
    Then the rights editor shows only the "Restricted" option, unticked
    When I save the rights
    Then the rights editor closes
    And the rights and restrictions section shows "<category>"
    And the image's usage rights are saved as:
      | category | <value> |

    Examples:
      | category        | value            |
      | Pay to use      | pay-to-use       |
      
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 74-76, 147
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 203-210, 328-330, 375-377, 389-391, 468-470, 564-566
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 47-50, 73-81
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 175-189

  @todo
  Scenario Outline: A conditional category requires restrictions before it can be saved
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "<category>" usage rights category
    Then the "Restricted" option is ticked and cannot be unticked
    And the rights cannot be saved
    When I enter the restrictions "Use in relation to the Windsor Triathlon only"
    And I save the rights
    Then the rights editor closes
    And the rights and restrictions section shows "<category>"
    And the image's usage rights are saved as:
      | category     | <value>                                       |
      | restrictions | Use in relation to the Windsor Triathlon only |

    Examples:
      | category     | value        |
      | PR Image     | PR Image     |
      | Handout      | handout      |
      | Social Media | social-media |
      | Pool         | pool         |
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 74-76
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala lines 272-274, 291-293, 357-359, 452-454
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 109-132
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 73-105, 217-225

  @todo
  Scenario: Restrictions can be added to a category that does not require them
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "Pay to use" usage rights category
    And I tick the "Restricted" option
    Then the rights cannot be saved
    When I enter the restrictions "Not for use on social media"
    And I save the rights
    Then the image's usage rights are saved as:
      | category     | pay-to-use                  |
      | restrictions | Not for use on social media |
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 73-105, 217-225

  @todo
  Scenario: Unticking Restricted removes the image's restrictions
    Given I am signed in with edit metadata permission
    And the image has the "Pay to use" usage rights category with the restrictions "Not for use on social media"
    And I have opened the rights editor
    Then the "Restricted" option is ticked
    When I untick the "Restricted" option
    And I save the rights
    Then the image's usage rights are saved as:
      | category | pay-to-use |
    And the image's saved usage rights have no "restrictions"
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 121-132, 175-185

  @todo
  Scenario Outline: A category with a free-text field requires it before saving
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "<category>" usage rights category
    Then the "<field>" field is a required text input with the placeholder "<placeholder>"
    And the rights cannot be saved
    When I fill in the "<field>" field with "<input>"
    And I save the rights
    Then the rights editor closes
    And the rights and restrictions section shows "<category>"
    And the image's usage rights are saved as:
      | category | <value> |
      | <key>    | <input> |

    Examples:
      | category                    | field        | placeholder                                  | input            | value                     | key          |
      | Agency - commissioned       | Supplier     | e.g. Corbis                                  | Corbis           | commissioned-agency       | supplier     |
      | Screengrab                  | Source       | e.g. BBC News, HBO, ITV                      | BBC News         | screengrab                | source       |
      | Composite                   | Suppliers    | e.g. REX/Getty Images/Corbis, Corbis/Reuters | REX/Getty Images | composite                 | suppliers    |
      | Photographer - commissioned | Photographer | e.g. Sophia Evans, Murdo MacLeod             | Sophia Evans     | commissioned-photographer | photographer |
      | Illustrator - commissioned  | Illustrator  | e.g. Ellie Foreman Peck, Matt Bors           | Matt Bors        | commissioned-illustrator  | creator      |
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 87, 99-102, 114-116, 125-131
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 107-128, 217-225

  @todo
  Scenario: Agency - subscription offers the configured free suppliers and an optional collection
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "Agency - subscription" usage rights category
    Then the "Supplier" field is a required dropdown offering:
      | AAP                     |
      | Action Images           |
      | Alamy                   |
      | Allstar Picture Library |
      | AP                      |
      | EPA                     |
      | Getty Images            |
      | PA                      |
      | Reuters                 |
      | Rex Features            |
      | Ronald Grant Archive    |
    And the "Collection" field is an optional text input with the placeholder "e.g. News"
    When I fill in the "Supplier" field with "Getty Images"
    And I fill in the "Collection" field with "News"
    And I save the rights
    Then the rights and restrictions section shows "Agency - subscription"
    And the image's usage rights are saved as:
      | category            | agency       |
      | supplier            | Getty Images |
      | suppliersCollection | News         |
  # Evidence: dev/script/generate-config/service-config.js lines 54-66
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 29, 80-85
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 118-128, 130-165
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 143-150

  @todo
  Scenario Outline: A configured publication determines which names can be chosen
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "<category>" usage rights category
    Then the "Publication" field is required and offers the options "Example publication"
    And the "<field>" dropdown offers no names
    When I fill in the "Publication" field with "Example publication"
    Then the "<field>" dropdown offers "<names>"
    When I fill in the "<field>" field with "<name>"
    And I save the rights
    Then the rights and restrictions section shows "<category>"
    And the image's usage rights are saved as:
      | category    | <value>             |
      | publication | Example publication |
      | <key>       | <name>              |

    Examples:
      | category                | field        | names                                                        | name                            | value                 | key          |
      | Photographer - staff    | Photographer | Example External Photographer, Example Internal Photographer | Example Internal Photographer   | staff-photographer    | photographer |
      | Photographer - contract | Photographer | Example Contracted Photographer                              | Example Contracted Photographer | contract-photographer | photographer |
      | Illustrator - contract  | Illustrator  | Example Contracted Illustrator                               | Example Contracted Illustrator  | contract-illustrator  | creator      |
  # Evidence: dev/script/generate-config/service-config.js lines 67-82
  # Evidence: common-lib/src/main/scala/com/gu/mediaservice/lib/config/UsageRightsConfig.scala lines 139-140, 181-184
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 59-72, 89-107
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 130-158, 167-194
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 151-159

  @todo
  Scenario: A name that is not configured can be entered using Other
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "Photographer - staff" usage rights category
    And I fill in the "Publication" field with "Example publication"
    And I tick "Other" next to the "Photographer" field
    Then the "Photographer" field is a required text input
    When I fill in the "Photographer" field with "Jane Smith"
    And I save the rights
    Then the image's usage rights are saved as:
      | category     | staff-photographer  |
      | publication  | Example publication |
      | photographer | Jane Smith          |
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 167-194
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 198-199

  @todo
  Scenario Outline: The publication is optional for commissioned photographers and illustrators
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "<category>" usage rights category
    Then the "Publication" field offers the options "Other, Example publication" with "Other" selected
    When I fill in the "<field>" field with "<name>"
    And I fill in the "Publication" field with "Example publication"
    And I save the rights
    Then the image's usage rights are saved as:
      | category    | <value>             |
      | publication | Example publication |
      | <key>       | <name>              |

    Examples:
      | category                    | field        | name         | value                     | key          |
      | Photographer - commissioned | Photographer | Sophia Evans | commissioned-photographer | photographer |
      | Illustrator - commissioned  | Illustrator  | Matt Bors    | commissioned-illustrator  | creator      |
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 59-61, 99-102, 114-116
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 130-158
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 143-150

  @todo
  Scenario: Illustrator - staff offers the configured staff illustrators
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "Illustrator - staff" usage rights category
    Then the "Illustrator" field is required and offers the options "Example Staff Illustrator"
    When I fill in the "Illustrator" field with "Example Staff Illustrator"
    And I save the rights
    Then the rights and restrictions section shows "Illustrator - staff"
    And the image's usage rights are saved as:
      | category | staff-illustrator         |
      | creator  | Example Staff Illustrator |
  # Evidence: dev/script/generate-config/service-config.js lines 83
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 109-112
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 130-158

  @todo
  Scenario: Creative Commons needs a configured licence, source, owner and link
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "Creative Commons" usage rights category
    Then the "Licence" field is required and offers the options "CC BY-4.0, CC BY-SA-4.0, CC BY-ND-4.0"
    And the "Source" field is a required text input with the placeholder "e.g. Wikimedia Commons"
    And the "Owner" field is a required text input with the placeholder "e.g. User:Colin"
    And the "Link to content" field is a required text input
    When I fill in the usage rights fields:
      | Licence         | CC BY-SA-4.0                                        |
      | Source          | Wikimedia Commons                                   |
      | Owner           | User:Colin                                          |
      | Link to content | https://commons.wikimedia.org/wiki/File:Example.jpg |
    And I save the rights
    Then the rights and restrictions section shows "Creative Commons"
    And the image's usage rights are saved as:
      | category    | creative-commons                                    |
      | licence     | CC BY-SA-4.0                                        |
      | source      | Wikimedia Commons                                   |
      | creator     | User:Colin                                          |
      | contentLink | https://commons.wikimedia.org/wiki/File:Example.jpg |
  # Evidence: common-lib/src/main/resources/application.conf lines 119-123
  # Evidence: metadata-editor/app/model/UsageRightsProperty.scala lines 118-123
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 118-158

  @todo
  Scenario: Changing category discards the fields entered for the previous one
    Given I am signed in with edit metadata permission
    And the image has no usage rights category
    And I have opened the rights editor
    When I choose the "Screengrab" usage rights category
    And I fill in the "Source" field with "BBC News"
    And I choose the "Composite" usage rights category
    Then the "Suppliers" field is empty
    When I fill in the "Suppliers" field with "REX/Getty Images"
    And I save the rights
    Then the image's usage rights are saved as:
      | category  | composite        |
      | suppliers | REX/Getty Images |
    And the image's saved usage rights have no "source"
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.html lines 21-27
  # Evidence: kahuna/public/js/usage-rights/usage-rights-editor.js lines 191-194

  # ---------------------------------------------------------------------------
  # Metadata templates driving the rights editor
  # ---------------------------------------------------------------------------

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

  Scenario: Choosing a template with the same category keeps the rights editor closed
    Given I am signed in with edit metadata permission
    And metadata templates are configured
    And the image has the "Agency - subscription" usage rights category
    When I choose a metadata template that sets the "Agency - subscription" usage rights category
    Then the rights editor is not shown
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 21-29
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 565-570, 596-601

  Scenario: Applying a template closes the rights preview
    Given I am signed in with edit metadata permission
    And metadata templates are configured
    And a metadata template's usage rights are being previewed on the image
    When I apply the metadata template
    Then the rights editor closes
    And the rights and restrictions section shows the template's usage rights category
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.html lines 10-11, 21-32
  # Evidence: kahuna/public/js/components/gr-image-metadata/gr-image-metadata.js lines 615-622

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
