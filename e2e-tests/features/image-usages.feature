Feature: Viewing an image's usages in the single image view
  This lets a user see where and when an image has been used across print, digital,
  fronts, downloads and syndication, grouped and ordered by status, and lets a user
  with the right permission delete all of the recorded usage information.

  Background:
    Given the application stack is running
    And I am signed in through pan-domain auth

  # ---------------------------------------------------------------------------
  # Usages tab
  # ---------------------------------------------------------------------------
  Scenario: The Usages tab shows the number of usages
    Given the image has 3 usages
    When I open the image
    Then the Usages tab is labelled "Usages (3)"
  # Evidence: kahuna/public/js/image/controller.js lines 201-205

  Scenario: The Usages tab is disabled when the image has no usages
    Given the image has no usages
    When I open the image
    Then the Usages tab is labelled "Usages (None)"
    And the Usages tab is disabled
  # Evidence: kahuna/public/js/image/controller.js lines 201-205
  # Evidence: kahuna/public/js/components/gr-radio-list/gr-radio-list.html lines 5

  Scenario: The Usages tab count updates when the image is updated
    Given the image has 3 usages
    When I open the image
    And I download the image
    Then the Usages tab is labelled "Usages (4)"
  # Evidence: kahuna/public/js/image/controller.js lines 201-205, 323-329

  Rule: Usages are listed on the Usages tab

    # Evidence: kahuna/public/js/image/view.html lines 166, 173
    # Evidence: kahuna/public/js/image/controller.js lines 154-159

      # -------------------------------------------------------------------------
      # Usage status groups
      # -------------------------------------------------------------------------
    Scenario: Each usage status is shown as its own group
      Given the image has usages with more than one status
      When I view the image's usages
      Then I see one usage group per status
      And each group is headed with the status name and the number of usages in it
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 3-5
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 2-8
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 39-50
      # Evidence: kahuna/public/js/services/image/usages.js lines 90-91

    Scenario Outline: Usage statuses are shown with friendly names
      Given the image has a usage with the "<status>" status
      When I view the image's usages
      Then the usage group is headed "<label>"
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 4
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 61-76

      Examples:
        | status     | label                |
        | removed    | Taken down           |
        | pending    | Pending publication  |
        | published  | Published            |
        | downloaded | Downloads            |
        | unknown    | Front                |
        | replaced   | replaced             |
        | derivative | derivative           |

    Scenario: Usage groups are ordered by status
      Given the image has pending, published, unknown, removed, downloaded and replaced usages
      When I view the image's usages
      Then the usage groups appear in the order pending, published, unknown, removed, downloaded, replaced
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 35, 42-45

    Scenario: Usages within a group are ordered newest first
      Given a usage group contains usages added on different dates
      When I view the image's usages
      Then the usages are listed with the most recently added first
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 41
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 11

   # -------------------------------------------------------------------------
   # Collapsing and expanding a group
   # -------------------------------------------------------------------------
    Scenario: A large group of usages starts collapsed when there are several groups
      Given the image has more than ten usages in a group alongside other groups
      When I view the image's usages
      Then that usage group is collapsed
      And the group's toggle shows the "chevron_right" icon
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 127, 129-131
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 6, 10

    Scenario: A small group starts expanded when there are several groups
      Given the image has ten or fewer usages in a group alongside other groups
      When I view the image's usages
      Then that usage group is expanded
      And the group's toggle shows the "expand_more" icon
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 127, 129-131
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 6, 10

    Scenario: A large group starts expanded when it is the only group
      Given the image has more than ten usages, all with the same status
      When I view the image's usages
      Then that usage group is expanded
      And the group's toggle shows the "expand_more" icon
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 48-50, 127, 129-131
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 6, 10

    Scenario: A large group starts collapsed when Photo Sales hides the other groups
      Given the send to Photo Sales feature is enabled
      And the image has more than ten downloaded usages and one published usage
      When I view the image's usages
      Then I only see the downloads usage group
      And that usage group is collapsed
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 3
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 48-50, 127, 129-131

    Scenario: Toggling a group shows and hides its usages
      Given the image has a usage with the "published" status
      When I view the image's usages
      Then that usage group is expanded
      When I activate the "Hide published usages" toggle
      Then the group's usages are hidden
      And the group's toggle is named "Show published usages"
      And the group's toggle shows the "chevron_right" icon
      When I activate the "Show published usages" toggle
      Then the group's usages are shown again
      And the group's toggle is named "Hide published usages"
      And the group's toggle shows the "expand_more" icon
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 2-7, 10
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 133-135

    Scenario Outline: A group's toggle is named after its lower-cased heading
      Given the image has a usage with the "<status>" status
      When I view the image's usages
      Then that usage group is expanded
      And the group's toggle is named "<name>"
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 5
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 61-76

      Examples:
        | status  | name                            |
        | removed | Hide taken down usages          |
        | pending | Hide pending publication usages |
        | unknown | Hide front usages               |
    # Individual usage records
    # -------------------------------------------------------------------------
    Scenario: A front usage is titled with the front and who added it
      Given the image has a front usage on the "uk/sport" front added by "Jane Smith"
      When I view the image's usages
      Then that usage is titled "uk/sport, Jane Smith"
    # Evidence: kahuna/public/js/services/image/usages.js lines 29-32, 39-41, 66-67
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 15

    Scenario: A download usage is titled with who downloaded it
      Given the image has a download usage downloaded by "Jane Smith"
      When I view the image's usages
      Then that usage is titled "Jane Smith"
    # Evidence: kahuna/public/js/services/image/usages.js lines 34-37, 42-43, 66-67
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 15

    Scenario Outline: A print or digital usage is titled with its reference name
      Given a usage on the "<platform>" platform has a "<reference>" reference named "<name>"
      When I view the image's usages
      Then that usage is titled "<name>"
    # Evidence: kahuna/public/js/services/image/usages.js lines 47-54, 66-67
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 15

      Examples:
        | platform | reference | name                       |
        | print    | indesign  | Main section, page 12      |
        | digital  | frontend  | Storm hits the south coast |

    Scenario Outline: A print or digital usage without a named reference has a fallback title
      Given a usage on the "<platform>" platform has no named "<reference>" reference
      When I view the image's usages
      Then that usage is titled "No title found."
    # Evidence: kahuna/public/js/services/image/usages.js lines 47-54, 66-67
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 15

      Examples:
        | platform | reference |
        | print    | indesign  |
        | digital  | frontend  |

    Scenario Outline: A <status> usage is described by its link to the child image, not a title
      Given a usage has the "<status>" status with child usage metadata
      When I view the image's usages
      Then the usage shows "<text>" followed by a link to the child image and who added it
      And that usage has no title of its own
    # Evidence: kahuna/public/js/services/image/usages.js lines 44-45, 66-67
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 15-22

      Examples:
        | status     | text           |
        | derivative | Used to create |
        | replaced   | Replaced with  |

    Scenario Outline: A usage shows an icon for its platform
      Given a usage was made on the "<platform>" platform
      When I view the image's usages
      Then that usage shows the "<icon>" icon
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 12-13

      Examples:
        | platform | icon          |
        | print    | local_library |
        | digital  | phonelink     |

    Scenario: A recently added usage is highlighted
      Given a usage was added within the last seven days
      When I view the image's usages
      Then that usage's icon is highlighted as a warning
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 12-13
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 141-145
      # Evidence: kahuna/public/js/services/image/usages.js lines 13, 113

    Scenario: An older usage is not highlighted
      Given a usage was added more than seven days ago
      When I view the image's usages
      Then that usage's icon is not highlighted
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 12-13
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 141-145

    Scenario: A usage shows a relative time with the exact date as a tooltip
      Given a usage has a date added
      When I view the image's usages
      Then the usage shows the time since it was added
      And hovering the time reveals the exact date and time
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 25
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 137-139

    Scenario: A usage links out to the places it was referenced
      Given a usage has a "frontend" reference and a "composer" reference
      When I view the image's usages
      Then the usage shows a frontend icon linking to the frontend reference
      And a composer icon linking to the composer reference
      And each reference link opens in a new tab
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 28-34

    Scenario: A reference without a URI is not linked
      Given a usage has a "frontend" reference with no URI
      When I view the image's usages
      Then that usage shows no frontend reference link
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage-list.html lines 28-32

    # -------------------------------------------------------------------------
    # Photo Sales panel (showSendToPhotoSales feature switch)
    # -------------------------------------------------------------------------
    Scenario: The Photo Sales panel is shown when the feature is enabled
      Given the send to Photo Sales feature is enabled
      And the image has a syndication usage with the "Capture" partner
      When I view the image's usages
      Then I see the Photo Sales usage panel
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 2
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 56
      # Evidence: kahuna/public/js/components/gr-image-usage-photosales/gr-image-usage-photosales.tsx lines 45

    Scenario: Only download, replaced and derivative usage groups are shown when Photo Sales is enabled
      Given the send to Photo Sales feature is enabled
      And the image has published, downloaded, replaced and derivative usages
      When I view the image's usages
      Then I only see the downloaded, replaced and derivative usage groups
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 3

    Scenario: The Photo Sales panel is not shown when the feature is disabled
      Given the send to Photo Sales feature is disabled
      And the image has a syndication usage with the "Capture" partner
      When I view the image's usages
      Then I do not see the Photo Sales usage panel
      And all of the image's usage groups are shown
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 2-3
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 56

    Scenario: The Photo Sales panel lists images sent to Capture
      Given the send to Photo Sales feature is enabled
      And the image has a syndication usage with the "Capture" partner
      When I view the image's usages
      Then the Photo Sales panel shows "Added to Photo Sales"
      And it shows who syndicated the image and the time since it was added
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 78-91
      # Evidence: kahuna/public/js/components/gr-image-usage-photosales/gr-image-usage-photosales.tsx lines 33-63
      # Evidence: kahuna/public/js/util/constants/sendToCapture-config.js lines 13

    Scenario: The Photo Sales panel is empty when the image has not been sent to Capture
      Given the send to Photo Sales feature is enabled
      And the image has no Capture syndication usage
      When I view the image's usages
      Then the Photo Sales panel shows no entries
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 78-91
      # Evidence: kahuna/public/js/components/gr-image-usage-photosales/gr-image-usage-photosales.tsx lines 33-41, 45

    # -------------------------------------------------------------------------
    # Deleting all usages
    # The delete button's accessible name is "Delete image" (aria-label), not its visible text.
    # -------------------------------------------------------------------------
    Scenario: A user with permission sees the delete all usages control
      Given I have delete usages permission
      And the image has at least one usage
      When I view the image's usages
      Then I see the "Delete ALL usages" control
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 8-12
      # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js lines 24, 28-34
      # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.html lines 1-5

    Scenario: A user without permission does not see the delete all usages control
      Given I do not have delete usages permission
      And the image has at least one usage
      When I view the image's usages
      Then I do not see the "Delete ALL usages" control
      # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js lines 28-31
      # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.html lines 2

    Scenario: The delete control is hidden for syndicated images when Photo Sales is enabled
      Given I have delete usages permission
      And the send to Photo Sales feature is enabled
      And the image has a syndication usage
      When I view the image's usages
      Then I do not see the "Delete ALL usages" control
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 9
      # Evidence: kahuna/public/js/services/image/usages.js lines 95
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 52

    Scenario: The delete control is shown for syndicated images when Photo Sales is disabled
      Given I have delete usages permission
      And the send to Photo Sales feature is disabled
      And the image has a syndication usage
      When I view the image's usages
      Then I see the "Delete ALL usages" control
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.html lines 8-12
    # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 52, 56
    # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js lines 28-34

    @todo
    Scenario: Confirming deletion removes all usage information and reloads the image
      Given I have delete usages permission
      And the image has at least one usage
      When I view the image's usages
      And I delete all usages, confirming with "DELETE"
      Then all usage information for the image is deleted
      And the single image view is reloaded
      # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js lines 36-50
      # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.html lines 2-4
      # Evidence: kahuna/public/js/components/gr-confirm-delete/gr-confirm-delete.js lines 12-31
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 93-95

    Scenario: Cancelling the delete confirmation leaves the usages untouched
      Given I have delete usages permission
      And the image has at least one usage
      When I view the image's usages
      And I cancel deleting all usages
      Then no usage information is deleted
      # Evidence: kahuna/public/js/components/gr-delete-usages/gr-delete-usages.js lines 37-49
      # Evidence: kahuna/public/js/components/gr-confirm-delete/gr-confirm-delete.js lines 12-31

    # -------------------------------------------------------------------------
    # Live updates
    # -------------------------------------------------------------------------
    Scenario: The usages refresh when the image is updated
      Given the image has at least one usage
      When I view the image's usages
      And I download the image
      Then the usages list includes my download
      # Evidence: kahuna/public/js/components/gr-image-usage/gr-image-usage.js lines 97-105
