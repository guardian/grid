package com.gu.mediaservice.lib.auth

import com.gu.editorial.permissions.client._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future


object Permissions extends PermissionsProvider {
  val app = "grid"

  val EditMetadata = Permission("edit_metadata", app, PermissionDenied)
  val DeleteImage = Permission("delete_image", app, PermissionDenied)
  val DeleteCrops = Permission("delete_crops", app, PermissionDenied)

  val all = Seq(EditMetadata, DeleteImage, DeleteCrops)

  implicit def config = PermissionsConfig(
    app = app,
    all = all
  )
}
