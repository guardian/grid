package controllers


import java.net.URI

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

import model.{Metadata, Edits}

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._


object Application extends Controller with ArgoHelpers {

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, Config.kahunaUri)

  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)

  val rootUri = Config.rootUri

  val transformers = new Transformers(Config.services)

  // TODO: add links to the different responses esp. to the reference image
  def index = Action {
    respond(Map("description" -> "This is the Metadata Editor Service"), List(
      Link("metadata", s"$rootUri/metadata/{id}")
    ))
  }

  def uri(id: String, endpoint: String = ""): URI = URI.create(s"$rootUri/metadata/$id/$endpoint")

  // TODO: Think about calling this `overrides` or something that isn't metadata
  def getAllMetadata(id: String) = Authenticated.async {
    dynamo.get(id) map { dynamoEntry =>
      // TODO: Find a way to return a hashmap of Entities
      val m = dynamoEntry.as[Edits]
      val archived = EmbeddedEntity(uri(id, "archived"), Some(m.archived))
      val labels = EmbeddedEntity(uri(id, "labels"), Some(m.labels))
      val rightsNotices = EmbeddedEntity(uri(id, "rightsNotices"), Some(m.rightsNotices))
      val metadata = EmbeddedEntity(uri(id, "metadata"), Some(m.metadata))


      // TODO: Fix this to take multiple types in Map.
      respondMap(Some(uri(id)), data = Map(
        "archived" -> archived
      ))

    } recover {
      // Empty object as no metadata edits recorded
      case NoItemFound => respond(Json.obj().as[Edits])
    }
  }

  def getArchived(id: String) = Authenticated.async {
    dynamo.booleanGet(id, "archived") map { archived =>
      EmbeddedEntity(uri(id, "archived"), Some(archived.getOrElse(false)))
    } recover {
      case NoItemFound => EmbeddedEntity(uri(id, "archived"), Some(false))
    } map (respondEntity(_))
  }

  def setArchived(id: String) = Authenticated.async { req =>
    booleanForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      archived => {
        val entityResult = Accepted(archivedResponse(archived, id)).as(ArgoMediaType)
        dynamo.booleanSetOrRemove(id, "archived", archived) map publishAndRespond(id, entityResult)
      }
    )
  }

  def unsetArchived(id: String) = Authenticated.async {
    dynamo.removeKey(id, "archived") map publishAndRespond(id)
  }


  def getLabels(id: String) = Authenticated.async {
    dynamo.setGet(id, "labels") map { labels =>
      labels.map(label =>
        EmbeddedEntity(uri(id, s"labels/$label"), Some(label))
      ).toSeq

    } map (respondCollection(_, None, None))
  }

  def addLabels(id: String) = Authenticated.async { req =>
    listForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      labels => {
        val entityResult = Accepted(labelsResponse(labels, id)).as(ArgoMediaType)
        dynamo.setAdd(id, "labels", labels) map publishAndRespond(id, entityResult)
      }
    )
  }

  def removeLabel(id: String, label: String) = Authenticated.async {
    dynamo.setDelete(id, "labels", label) map publishAndRespond(id)
  }


  def getMetadata(id: String) = Authenticated.async {
    dynamo.jsonGet(id, "metadata").map(metadata => Ok(metadataResponse(metadata, id)))
  }

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


  def archivedResponse(archived: Boolean, id: String): JsValue =
    JsBoolean(archived).transform(transformers.wrapArchived(id)).get

  def metadataResponse(metadata: Map[String, String], id: String): JsValue =
    metadataResponse(Json.toJson(metadata), id)

  def metadataResponse(metadata: JsValue, id: String): JsValue =
    metadata.transform(transformers.wrapMetadata(id)).get

  def labelResponse(label: String, id: String): JsValue =
    JsString(label).transform(transformers.wrapLabel(id)).get

  def labelsResponse(labels: List[String], id: String): JsValue =
    labelsResponse(Json.toJson(labels), id)

  def labelsResponse(labels: JsValue, id: String): JsValue =
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

  val listForm: Form[List[String]] = Form(
     single[List[String]]("data" -> list(text))
  )

}
