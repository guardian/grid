package com.gu.mediaservice.lib.auth

import com.amazonaws.auth.AWSCredentialsProvider
import com.gu.editorial.permissions.client._


class Permissions(stage: String, awsCredentials: AWSCredentialsProvider) extends PermissionsProvider {
  import Permissions._

  implicit def config = PermissionsConfig(
    app = app,
    all = all,
    s3BucketPrefix = if(stage == "PROD") "PROD" else "CODE",
    awsCredentials = awsCredentials
  )
}

object Permissions {
  val app = "grid"

  val EditMetadata = Permission("edit_metadata", app, PermissionDenied)
  val DeleteImage = Permission("delete_image", app, PermissionDenied)
  val DeleteCrops = Permission("delete_crops", app, PermissionDenied)
  val ShowPaid = Permission("show_paid", app, PermissionDenied)

  val all = Seq(EditMetadata, DeleteImage, DeleteCrops)
}
