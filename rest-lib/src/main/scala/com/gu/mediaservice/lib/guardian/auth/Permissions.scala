package com.gu.mediaservice.lib.guardian.auth

import com.gu.permissions.PermissionDefinition

object Permissions {
  val app = "grid"

  val EditMetadata: PermissionDefinition = PermissionDefinition("edit_metadata", app)
  val DeleteImage: PermissionDefinition = PermissionDefinition("delete_image", app)
  val DeleteCrops: PermissionDefinition = PermissionDefinition("delete_crops", app)
  val ShowPaid: PermissionDefinition = PermissionDefinition("show_paid", app)

  // FIXME ideally factor this out in favour of a permission definition that can be defined at runtime (e.g. loaded from config)
  val Pinboard: PermissionDefinition = PermissionDefinition("pinboard", "pinboard")
}
