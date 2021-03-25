package com.gu.mediaservice.lib.auth.provider

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.SimplePermission
import com.typesafe.scalalogging.StrictLogging

class LocalAuthorisationProvider extends AuthorisationProvider with StrictLogging {
  logger.warn("Authorisation set to local, every user will have permission for everything")
  override def hasPermissionTo(permission: SimplePermission, principal: Principal): Boolean = true
}
