package com.gu.mediaservice.lib.auth

import com.amazonaws.auth.AWSCredentialsProvider
import com.gu.editorial.permissions.client._


class Permissions(awsCredentials: AWSCredentialsProvider) extends PermissionsProvider {
  import Permissions._

  implicit def config = PermissionsConfig(
    app = app,
    all = all,
    awsCredentials = awsCredentials
  )
}

object Permissions {
  val app = "grid"

  val EditMetadata = Permission("edit_metadata", app, PermissionDenied)
  val DeleteImage = Permission("delete_image", app, PermissionDenied)
  val DeleteCrops = Permission("delete_crops", app, PermissionDenied)

  val all = Seq(EditMetadata, DeleteImage, DeleteCrops)
}
