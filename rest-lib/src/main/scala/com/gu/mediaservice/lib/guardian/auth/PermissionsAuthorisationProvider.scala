package com.gu.mediaservice.lib.guardian.auth

import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.Permissions._
import com.gu.mediaservice.lib.auth.provider.{AuthorisationProvider, AuthorisationProviderResources}
import com.gu.mediaservice.lib.auth.{PermissionContext, PermissionWithParameter}
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.permissions._
import com.typesafe.scalalogging.StrictLogging
import play.api.Configuration

import scala.concurrent.duration.DurationInt

class PermissionsAuthorisationProvider(configuration: Configuration, resources: AuthorisationProviderResources)
  extends AuthorisationProvider with StrictLogging {

  def config: CommonConfig = resources.commonConfig
  def permissionsBucket: String = configuration.getOptional[String]("permissions.bucket").getOrElse("permissions-cache")

  private val permissions: PermissionsProvider = config.awsLocalEndpoint match {
    case Some(_) if config.isDev && config.useLocalAuth =>
      val provider = new S3PermissionsProvider(permissionsBucket, "permissions.json", 1.minute, PermissionsS3(S3Ops.buildS3Client(config)))
      provider.start()
      provider
    case _ =>
      val permissionsStage = if(config.isProd) { "PROD" } else { "CODE" }
      PermissionsProvider(PermissionsConfig(permissionsStage, config.awsRegion, config.awsCredentials, permissionsBucket))
  }

  override def initialise(): Unit = {
    /**
      * Wait for the store to be populated before proceeding as otherwise we might let users do things they are not
      * allowed to do. This is undeniably a hack due to a lack of any futures to wait on in the permissions code. However
      * it does clean up a lot of other considerations
      */
    var sleepTimeSeconds = 1
    while(permissions.storeIsEmpty) {
      logger.info(s"Permissions store is empty, waiting $sleepTimeSeconds seconds for it to be populated with data before continuing startup")
      Thread.sleep(sleepTimeSeconds * 1000)
      sleepTimeSeconds = math.min(sleepTimeSeconds * 2, 30)
    }
  }

  private def hasPermission(user: Principal, permission: PermissionDefinition): Boolean = {
    user match {
      case UserPrincipal(_, _, email, _) => permissions.hasPermission(permission, email)
      case _ => false
    }
  }

  override def hasPermissionTo[T](permissionContext: PermissionContext[T]): PrincipalFilter = {
    val permissionDefinition = permissionContext match {
      case PermissionContext(EditMetadata, _) => Permissions.EditMetadata
      case PermissionContext(DeleteImage, _) => Permissions.DeleteImage
      case PermissionContext(DeleteCrops, _) => Permissions.DeleteCrops
      case PermissionContext(ShowPaid, _) => Permissions.ShowPaid
    }
    { user: Principal => hasPermission(user, permissionDefinition) }
  }

  // there are none of these right now so simply always return true
  override def visibilityFilterFor[T](permission: PermissionWithParameter[T],
                                      principal: Principal): VisibilityFilter[T] = {
    { _: T => true }
  }
}
