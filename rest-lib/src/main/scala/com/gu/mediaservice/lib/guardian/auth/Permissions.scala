package com.gu.mediaservice.lib.guardian.auth

import com.gu.permissions.PermissionDefinition

object Permissions {
  val app = "grid"

  val EditMetadata = PermissionDefinition("edit_metadata", app)
  val DeleteImage = PermissionDefinition("delete_image", app)
  val DeleteCrops = PermissionDefinition("delete_crops", app)
  val ShowPaid = PermissionDefinition("show_paid", app)

  val all = Seq(EditMetadata, DeleteImage, DeleteCrops)
}
