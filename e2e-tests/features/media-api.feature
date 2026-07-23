Feature: Frontend loads media-api

  The Kahuna SPA reads the media-api URL from a <link rel="media-api-uri"> element and
  immediately requests the media-api root to discover its hypermedia links. dev-nginx
  routes https://api.media.<domain> to the media-api port on the grid-all container.

  Scenario: The SPA discovers and requests media-api from the grid-all container
    When I open the Grid application
    Then the page exposes a media-api URI link
    And the media-api is served successfully
