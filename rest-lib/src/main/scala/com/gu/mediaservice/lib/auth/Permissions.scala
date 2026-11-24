package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.permissions.PermissionDefinition
import com.gu.mediaservice.auth.{Permissions => PermissionDef}


/** The name of the permission that we are checking, e.g. edit_collection */
sealed trait Permission[T] {
  def name: String = getClass.getSimpleName
  def definition: Option[PermissionDefinition] = None
}

sealed trait SimplePermission extends Permission[Unit]

object Permissions {
  /** A predicate that takes a principal and returns a boolean reflecting whether the principal has permission or not */
  type PrincipalFilter = Principal => Boolean

  case object GridAccess          extends SimplePermission { override val definition = Some(PermissionDef.GridAccess) }
  case object EditMetadata        extends SimplePermission { override val definition = Some(PermissionDef.EditMetadata) }
  case object DeleteImage         extends SimplePermission { override val definition = Some(PermissionDef.DeleteImage) }
  case object DeleteCropsOrUsages extends SimplePermission { override val definition = Some(PermissionDef.DeleteCropsOrUsages) }
  case object ShowPaid            extends SimplePermission { override val definition = Some(PermissionDef.ShowPaid) }
  case object Pinboard            extends SimplePermission { override val definition = Some(PermissionDef.Pinboard) }
  case object UploadImages        extends SimplePermission { override val definition = Some(PermissionDef.UploadImages) }
  case object DeveloperAdmin      extends SimplePermission { override val definition = Some(PermissionDef.DeveloperAdmin) }
  case object ArchiveImages       extends SimplePermission // no backing definition

  def isDeletePermission(permission: SimplePermission): Boolean = permission match {
    case DeleteImage | DeleteCropsOrUsages => true
    case _ => false
  }
}
