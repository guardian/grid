package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.Principal

/** The name of the permission that we are checking, e.g. edit_collection */
sealed trait Permission[T] {
  def name: String = getClass.getSimpleName
}

sealed trait SimplePermission extends Permission[Unit]

sealed trait PermissionWithParameter[T] extends Permission[T] {
  def ->(v: T): PermissionContext1[T] = PermissionContext1(this, v)
}

trait PermissionContext[T] {
  def permission: Permission[T]
  def parameter: T
}
case class PermissionContext0(permission: Permission[Unit]) extends PermissionContext[Unit] {
  val parameter: Unit = ()
}
case class PermissionContext1[T](permission: Permission[T], parameter: T) extends PermissionContext[T]

object Permissions {
  /** A predicate that takes a principal and returns a boolean reflecting whether the principal has permission or not */
  type PrincipalFilter = Principal => Boolean
  /** A predicate that takes a parameter value and returns a boolean reflecting on whether a principal can see this
    * record or not */
  type VisibilityFilter[T] = T => Boolean

  case object EditMetadata extends SimplePermission
  case object DeleteImage extends SimplePermission
  case object DeleteCrops extends SimplePermission
  case object ShowPaid extends SimplePermission
}
