package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.Link

trait ArgoErrorResponses extends ArgoHelpers {
  def loginUriTemplate: String

  val loginLinks = List(
    Link("login", loginUriTemplate)
  )

  // Panda errors
  val notAuthenticatedResult = respondError(Unauthorized, "unauthorized", "Not authenticated", loginLinks)
  val invalidCookieResult    = notAuthenticatedResult
  val expiredResult          = respondError(new Status(419), "session-expired", "Session expired, required to log in again", loginLinks)
  val notAuthorizedResult    = respondError(Forbidden, "forbidden", "Not authorized", loginLinks)

  // API key errors
  val invalidApiKeyResult    = respondError(Unauthorized, "invalid-api-key", "Invalid API key provided", loginLinks)
}
