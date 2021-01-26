package com.gu.mediaservice.lib.guardian.auth

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.Permissions._
import com.gu.mediaservice.lib.auth.provider.{AuthorisationProvider, AuthorisationProviderResources}
import com.gu.mediaservice.lib.auth.{Internal, PermissionWithParameter, SimplePermission}
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.permissions._
import play.api.Configuration

import scala.concurrent.duration.DurationInt

class PermissionsAuthorisationProvider(configuration: Configuration, resources: AuthorisationProviderResources)
  extends AuthorisationProvider {

  def config: CommonConfig = resources.commonConfig
  def permissionsBucket: String = configuration.getOptional[String]("permissions.bucket").getOrElse("permissions-cache")

  private val permissions: PermissionsProvider = config.awsLocalEndpoint match {
    case Some(_) if config.isDev && config.useLocalAuth => {
      val provider = new S3PermissionsProvider(permissionsBucket, "permissions.json", 1.minute, PermissionsS3(S3Ops.buildS3Client(config)))
      provider.start()
      provider
    }
    case _ => {
      val permissionsStage = if(config.isProd) { "PROD" } else { "CODE" }
      PermissionsProvider(PermissionsConfig(permissionsStage, config.awsRegion, config.awsCredentials, permissionsBucket))
    }
  }

  def storeIsEmpty: Boolean = {
    permissions.storeIsEmpty
  }

  override def isReady(): Boolean = !storeIsEmpty

  private def hasPermission(user: Principal, permission: PermissionDefinition): Boolean = {
    user match {
      case UserPrincipal(_, _, email, _) => permissions.hasPermission(permission, email)

      /* TODO: SAH - this probably belongs in some common code to allow service tiers to work? Perhaps service tiers should
       * disappear with this work...
       */
      // think about only allowing certain services i.e. on `service.name`?
      case service: MachinePrincipal if service.accessor.tier == Internal => true
      case _ => false
    }
  }

  override def hasPermissionTo[T](permission: SimplePermission): PrincipalFilter = {
    val definition = permission match {
      case EditMetadata => Permissions.EditMetadata
      case DeleteImage => Permissions.DeleteImage
      case DeleteCrops => Permissions.DeleteCrops
      case ShowPaid => Permissions.ShowPaid
    }
    { user: Principal => hasPermission(user, definition) }
  }

  // there are none of these right now so simply always return true
  override def hasPermissionTo[T](permission: PermissionWithParameter[T],
                                  parameter: T): PrincipalFilter =
    { _: Principal => true }

  // there are none of these right now so simply always return true
  override def visibilityFilterFor[T](permission: PermissionWithParameter[T],
                                      principal: Principal): VisibilityFilter[T] =
    { _: T => true }
}
