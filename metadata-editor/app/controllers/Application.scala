package controllers


import com.gu.mediaservice.api.Transformers
import com.gu.mediaservice.lib.argo.ArgoHelpers

import scala.concurrent.Future

import _root_.play.api.data._, Forms._
import _root_.play.api.mvc.{Action, Controller, Result}
import _root_.play.api.libs.json._
import _root_.play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.aws.{NoItemFound, DynamoDB}
import lib._


object Application extends Controller with ArgoHelpers {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, Config.kahunaUri)

  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)

  val rootUri = Config.rootUri

  val transformers = new Transformers(Config.services)


  def index = Action {
    val response = Json.obj(
      "data"  -> Json.obj("description" -> "This is the Metadata Editor Service"),
      "links" -> Json.arr(
        Json.obj("rel" -> "metadata", "href" -> s"$rootUri/metadata/{id}")
      )
    )
    Ok(response).as(ArgoMediaType)
  }

  // TODO: Think about calling this `overrides` or something that isn't metadata
  def getAllMetadata(id: String) = Authenticated.async {
    dynamo.get(id) map {
      metadata => Ok(allMetadataResponse(metadata, id)).as(ArgoMediaType)
    } recover {
      // Empty object as no metadata edits recorded
      case NoItemFound => Ok(allMetadataResponse(Json.obj(), id)).as(ArgoMediaType)
    }
  }

  def getArchived(id: String) = Authenticated.async {
    dynamo.booleanGet(id, "archived") map { archived =>
      Ok(Json.obj("data" -> archived)).as(ArgoMediaType)
    }
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
    dynamo.setGet(id, "labels") map { labels =>
      Ok(labelsResponse(labels.toList, id)).as(ArgoMediaType)
    }
  }

  def addLabel(id: String) = Authenticated.async { req =>
    stringForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      label => {
        val entityResult = Accepted(labelResponse(label, id)).as(ArgoMediaType)
        dynamo.setAdd(id, "labels", label) map publishAndRespond(id, entityResult)
      }
    )
  }

  def removeLabel(id: String, label: String) = Authenticated.async {
    dynamo.setDelete(id, "labels", label) map publishAndRespond(id)
  }


  def getMetadata(id: String) = Authenticated.async {
    dynamo.jsonGet(id, "metadata").map(metadata => Ok(metadataResponse(metadata, id)))
  }

  // TODO: Make a metadataForm that restricts description / credit
  // ALWAYS send over the whole document or you'll lose your data
  case class MapEntity(data: Map[String, String])

  implicit val mapEntityReads: Reads[MapEntity] = Json.reads[MapEntity]

  def setMetadata(id: String) = Authenticated.async(parse.json) { req =>
    req.body.validate[MapEntity].map {
      case MapEntity(metadata) =>
        val entityResult = Accepted(metadataResponse(metadata, id)).as(ArgoMediaType)
        dynamo.jsonAdd(id, "metadata", metadata) map publishAndRespond(id, entityResult)
    } recoverTotal {
      case e => Future.successful(BadRequest("Invalid metadata sent: " + JsError.toFlatJson(e)))
    }
  }


  def metadataResponse(metadata: Map[String, String], id: String): JsValue =
    metadataResponse(Json.toJson(metadata), id)

  def metadataResponse(metadata: JsValue, id: String): JsValue =
    metadata.transform(transformers.wrapMetadata(id)).get

  def labelResponse(label: String, id: String): JsValue =
    JsString(label).transform(transformers.wrapLabel(id)).get

  def labelsResponse(labels: Seq[String], id: String): JsValue =
    labelsResponse(Json.arr(labels), id)

  def labelsResponse(labels: JsArray, id: String): JsValue =
    labels.transform(transformers.wrapLabels(id)).get

  def allMetadataResponse(metadata: JsObject, id: String): JsValue =
    metadata.transform(transformers.wrapAllMetadata(id)).get


  // Publish changes to SNS and return an empty Result
  def publishAndRespond(id: String, result: Result = NoContent)(metadata: JsObject): Result = {
    // TODO: transform first? uri, embedded entities
    val message = Json.obj(
      "id" -> id,
      "data" -> metadata
    )
    Notifications.publish(message, "update-image-user-metadata")

    result
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
