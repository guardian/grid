package controllers

import scala.concurrent.Future

import _root_.play.api.data._, Forms._
import _root_.play.api.mvc.{Action, Controller, Result}
import _root_.play.api.libs.json._
import _root_.play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.aws.{NoItemFound, DynamoDB}
import lib._


object Application extends Controller {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, Config.kahunaUri)

  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)

  val rootUri = Config.rootUri

  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Metadata Editor Service"),
      "links" -> Json.arr(
        Json.obj("rel" -> "metadata", "href" -> s"$rootUri/metadata/{id}")
      )
    )
    Ok(response)
  }

  def getMetadata(id: String) = Authenticated.async {
    dynamo.get(id) map {
      metadata => Ok(metadataResponse(metadata))
    } recover {
      // Empty object as no metadata edits recorded
      case NoItemFound => Ok(metadataResponse(Json.obj()))
    }
  }

  def getArchived(id: String) = Authenticated.async {
    dynamo.booleanGet(id, "archived") map { archived => Ok(Json.obj("data" -> archived)) }
  }

  def setArchived(id: String) = Authenticated.async { req =>
    booleanForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      archived => {
        dynamo.booleanSet(id, "archived", archived) map publishAndRespond(id)
      }
    )
  }

  def unsetArchived(id: String) = Authenticated.async {
    dynamo.removeKey(id, "archived") map publishAndRespond(id)
  }


  def getLabels(id: String) = Authenticated.async {
    dynamo.setGet(id, "labels") map { labels => Ok(Json.obj("data" -> labels)) }
  }

  def addLabel(id: String) = Authenticated.async { req =>
    stringForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      label => {
        dynamo.setAdd(id, "labels", label) map publishAndRespond(id)
      }
    )
  }

  def removeLabel(id: String, label: String) = Authenticated.async {
    dynamo.setDelete(id, "labels", label) map publishAndRespond(id)
  }

  def metadataResponse(metadata: JsValue): JsValue =
    Json.obj(
      "data" -> metadata,
      "links" -> Json.arr(
        Json.obj("rel" -> "archived", "href" -> s"$rootUri/metadata/{id}/archived"),
        Json.obj("rel" -> "labels",   "href" -> s"$rootUri/metadata/{id}/labels")
      )
    )

  // Publish changes to SNS and return an empty Result
  def publishAndRespond(id: String)(metadata: JsObject): Result = {
    // TODO: transform first? uri, embedded entities
    val message = Json.obj(
      "id" -> id,
      "data" -> metadata
    )
    println("publish", message)
    Notifications.publish(message, "update-image-user-metadata")

    NoContent
  }


  val booleanForm: Form[Boolean] = Form(
     single("data" -> boolean)
       .transform[Boolean]({ case (value)        => value },
                           { case value: Boolean => value })
  )

  val stringForm: Form[String] = Form(
     single("data" -> text)
       .transform[String]({ case (value)       => value },
                          { case value: String => value })
  )

}
