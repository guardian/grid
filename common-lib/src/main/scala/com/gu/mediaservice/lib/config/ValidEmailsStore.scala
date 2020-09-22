package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.BaseStore
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext
import scala.util.{Failure, Success, Try}

class ValidEmailsStore(bucket: String, config: CommonConfig)(implicit ec: ExecutionContext)
  extends BaseStore[String, List[String]](bucket, config)(ec) {

  val emailKey = "validEmails"
  val emailListFileName = "valid_emails.json"

  fetchAll match {
    case Some(_) => Logger.info("Valid emails read in from config bucket")
    case None => throw FailedToLoadEmailStore
  }

  def update() {
    lastUpdated.send(_ => DateTime.now())
    fetchAll match {
      case Some(emailList) => store.send(_ => emailList)
      case None => Logger.warn("Could not parse valid email list JSON")
    }
  }

  private def fetchAll: Option[Map[String, List[String]]] = {
    getS3Object(emailListFileName) match {
      case Some(fileContents) => Try(Json.parse(fileContents).as[List[String]]) match {
        case Success(json) => Some(Map(emailKey -> json))
        case Failure(_) => None
      }
      case None => None
    }
  }

  def getValidEmails: Option[List[String]] = store.get().get(emailKey)
}

case object FailedToLoadEmailStore extends Exception("Failed to load valid emails from S3 permissions bucket on start up")
