package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.PermissionType.PermissionType
import com.gu.mediaservice.lib.config.Properties
import com.gu.mediaservice.lib.BaseStore

import org.slf4j.LoggerFactory

import scala.collection.JavaConverters._
import scala.concurrent.Future
import scala.concurrent.duration._

import akka.actor.Scheduler
import akka.agent.Agent

import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.aws.S3
import com.amazonaws.auth.AWSCredentials
import org.apache.commons.io.IOUtils
import com.amazonaws.AmazonServiceException

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model.DateFormat

import org.joda.time.DateTime

object PermissionType extends Enumeration {
  implicit val writer = new Writes[PermissionType] {
    def writes(p: PermissionType) = JsString(p.toString)
  }

  type PermissionType = Value
  val EditMetadata = Value("editMetadata")
  val DeleteImage  = Value("deleteImage")
  val DeleteCrops  = Value("deleteCrops")
  val BigSpender   = Value("bigSpender")
}

case class PermissionSet(
  user: PandaUser,
  permissions: Set[PermissionType.PermissionType],
  lastUpdated: DateTime
)
object PermissionSet {
  implicit val pandaUserWrites: Writes[PandaUser] = (
    (__ \ "email").write[String] ~
    (__ \ "firstName").write[String] ~
    (__ \ "lastName").write[String] ~
    (__ \ "avatarUrl").writeNullable[String]
  )(unlift(PandaUser.unapply))
  implicit def permissionTypeWrites: Writes[PermissionType] = new Writes[PermissionType] {
    def writes(permissionType: PermissionType.PermissionType): JsValue = JsString(permissionType.toString)
  }
  implicit val permissionSetWrites: Writes[PermissionSet] = Json.writes[PermissionSet]
}

case class StoreAccess(store: Map[PermissionType, List[String]], lastUpdated: DateTime)
object StoreAccess {
  type StoreMap = Map[PermissionType, List[String]]

  implicit val dateTimeFormat = DateFormat
  implicit def storeAccessWrites: Writes[StoreAccess] = Json.writes[StoreAccess]
  implicit val storeWriter = new Writes[StoreMap] {
    def writes(s: StoreMap) = s.foldLeft(JsObject(Seq())) { case (memo,(k,v)) => memo + (k.toString -> Json.toJson(v)) }
  }
}

class PermissionStore(bucket: String, credentials: AWSCredentials)
  extends BaseStore[PermissionType, List[String]](bucket, credentials) {

  type FuturePerms = Future[Set[PermissionType.PermissionType]]

  def getUserPermissions(
    user: PandaUser
  ): Future[PermissionSet] = {
    val storeAccess = for {
      s <- store.future
      l <- lastUpdated.future
    } yield StoreAccess(s,l)

    storeAccess.map(s => {
      (s.store.filter {
        case (_, list) => list.contains(user.email.toLowerCase)
        case _ => false
      }.keys.toSet, s.lastUpdated)
    }).map {
      case (keys, lastUpdated) => PermissionSet(user, keys, lastUpdated)
    }
  }

  def getGroups(): Future[StoreAccess] = for {
    s <- store.future
    l <- lastUpdated.future
  } yield StoreAccess(s,l)

  def hasPermission(permission: PermissionType, userEmail: String) = {
    store.future().map {
      list => {
        list.get(permission) match {
          case Some(userList) => userList.contains(userEmail.toLowerCase)
          case None => false
        }
      }
    }
  }

  def update() {
    store.sendOff(_ => getList())
  }

  private def getList(): Map[PermissionType, List[String]] = {
    val fileContents = getS3Object("permissions.properties")
    fileContents match {
      case Some(contents) => {
        val properties = Properties.fromString(contents)

        PermissionType.values.toList.map(permission => {
          properties.get(permission.toString) match {
            case Some(value) => (permission, value.split(",").toList.map(_.toLowerCase))
            case None => (permission, List())
          }
        }).toMap
      }
      case None => {
        PermissionType.values.toList.map(permission => (permission, List())).toMap
      }
    }
  }
}
