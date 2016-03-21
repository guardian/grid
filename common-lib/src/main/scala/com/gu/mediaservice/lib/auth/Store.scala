package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.PermissionType.PermissionType
import com.gu.mediaservice.lib.config.Properties
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

import org.joda.time.DateTime

abstract class BaseStore[TStoreKey, TStoreVal](bucket: String, credentials: AWSCredentials) {
  val s3 = new S3(credentials)

  private val log = LoggerFactory.getLogger(getClass)

  protected val store: Agent[Map[TStoreKey, TStoreVal]] = Agent(Map.empty)
  protected val lastUpdated: Agent[DateTime] = Agent(DateTime.now())

  protected def getS3Object(key: String): Option[String] = {
    val content = s3.client.getObject(bucket, key)
    val stream = content.getObjectContent
    try
      Some(IOUtils.toString(stream, "utf-8").trim)
    catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" => {
        log.warn(s"Cannot find key: $key in bucket: $bucket")
        None
      }
    }
    finally
      stream.close()
  }

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def update(): Unit
}

class KeyStore(bucket: String, credentials: AWSCredentials) extends BaseStore[String, String](bucket, credentials) {
  def lookupIdentity(key: String): Future[Option[String]] =
    store.future.map(_.get(key))

  def findKey(prefix: String): Option[String] = s3.syncFindKey(bucket, prefix)

  def update() {
    lastUpdated.sendOff(_ => DateTime.now())
    store.sendOff(_ => fetchAll)
  }

  private def fetchAll: Map[String, String] = {
    val keys = s3.client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey)
    keys.flatMap(k => getS3Object(k).map(k -> _)).toMap
  }
}

object PermissionType extends Enumeration {
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
class PermissionStore(bucket: String, credentials: AWSCredentials) extends BaseStore[PermissionType, List[String]](bucket, credentials) {

  type FuturePerms = Future[Set[PermissionType.PermissionType]]
  case class StoreAccess(store: Map[PermissionType, List[String]], lastUpdated: DateTime)

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
