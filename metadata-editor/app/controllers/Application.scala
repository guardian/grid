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
      val archived = archivedEntity(id, m.archived)
      val labels = labelsEntity(id, m.labels.toSet)
      val metadata = metadataEntity(id, m.metadata)

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
      archivedEntity(id, archived.getOrElse(false))
    } recover {
      case NoItemFound => archivedEntity(id, false)
    } map (respondEntity(_))
  }

  def setArchived(id: String) = Authenticated.async { req =>
    booleanForm.bindFromRequest()(req).fold(
      errors   => Future.successful(BadRequest(errors.errorsAsJson)),
      archived => {
        val response = respondEntity(archivedEntity(id, archived))
        dynamo.booleanSetOrRemove(id, "archived", archived) map publishAndRespond(id, response)
      }
    )
  }

  def unsetArchived(id: String) = Authenticated.async {
    val response = respondEntity(archivedEntity(id, false))
    dynamo.removeKey(id, "archived") map publishAndRespond(id, response)
  }


  def getLabels(id: String) = Authenticated.async {
    dynamo.setGet(id, "labels")
      .map(labelsEntity(id, _))
      .map(respondCollection(_, None, None))
  }

  def addLabels(id: String) = Authenticated.async { req =>
    listForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      labels => {
        val response = respondCollection(labelsEntity(id, labels.toSet), None, None)
        dynamo.setAdd(id, "labels", labels) map publishAndRespond(id, response)
      }
    )
  }

  def removeLabel(id: String, label: String) = Authenticated.async {
    dynamo.setDelete(id, "labels", label) map publishAndRespond(id)
  }


  def getMetadata(id: String) = Authenticated.async {
    dynamo.jsonGet(id, "metadata").map { dynamoEntry =>
      val metadata = (dynamoEntry \ "metadata").as[Metadata]
      EmbeddedEntity(uri(id, s"metadata"), Some(metadata))
    } map (respondEntity(_))
  }

  def setMetadata(id: String) = Authenticated.async(parse.json) { req =>
    metadataForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      metadata => {
        val response = respondEntity(metadataEntity(id, metadata))
        // FIXME: Converting to convert back is a bit silly
        dynamo.jsonAdd(id, "metadata", Json.toJson(metadata).as[Map[String, String]]) map publishAndRespond(id, response)
      }
    )
  }

  def archivedEntity(id: String, archived: Boolean): EmbeddedEntity[Boolean] =
    EmbeddedEntity(uri(id, "archived"), Some(archived))

  def labelsEntity(id: String, labels: Set[String]): Seq[EmbeddedEntity[String]] =
    labels.map(labelEntity(id, _)).toSeq

  def labelEntity(id: String, label: String): EmbeddedEntity[String] =
    EmbeddedEntity(uri(id, s"labels/$label"), Some(label))

  def metadataEntity(id: String, metadata: Metadata) =
    EmbeddedEntity(uri(id, s"metadata"), Some(metadata))

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

  val metadataForm: Form[Metadata] = Form(
    single("data" -> mapping(
      "description" -> optional(text),
      "byline" -> optional(text),
      "credit" -> optional(text)
    )(Metadata.apply)(Metadata.unapply))
  )

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
