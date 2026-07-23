Feature: Kahuna service availability

  Smoke checks that the Kahuna service, booted by Testcontainers in global-setup,
  is serving requests against the provisioned infrastructure.

  Scenario: Healthcheck responds OK
    When I request the Kahuna healthcheck endpoint
    Then the response is successful

  Scenario: Kahuna serves the application
    When I request the Kahuna root path without following redirects
    Then the response status is below 500
