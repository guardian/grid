package controllers


import java.net.URI

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.model.ImageMetadata

import scala.concurrent.Future

import play.api.data._, Forms._
import play.api.mvc.{Action, Controller, Result}
import play.api.libs.json._
import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.aws.{NoItemFound, DynamoDB}
import lib._

import model.Edits

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._


// FIXME: the argoHelpers are all returning `Ok`s (200)
// Some of these responses should be `Accepted` (202)
object Application extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUri, kahunaUri}

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUri, kahunaUri)

  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)

  // TODO: add links to the different responses esp. to the reference image
  def index = Action {
    respond(Map("description" -> "This is the Metadata Editor Service"), List(
      Link("metadata", s"$rootUri/metadata/{id}")
    ))
  }

  def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$rootUri/metadata/$id$endpoint")

  // TODO: Think about calling this `overrides` or something that isn't metadata
  def getAllMetadata(id: String) = Authenticated.async {
    dynamo.get(id) map { dynamoEntry =>

      val edits = dynamoEntry.as[Edits]

      // We have to do the to JSON here as we are using a custom JSON writes.
      // TODO: have the argo helpers allow you to do this
      respond(Json.toJson(edits)(Edits.EditsWritesArgo(id)))

    } recover {
      // Empty object as no metadata edits recorded
      case NoItemFound => {
        val e = Edits(false, List(), Edits.emptyMetadata)
        respond(Json.toJson(e)(Edits.EditsWritesArgo(id)))
      }
    }
  }

  def getArchived(id: String) = Authenticated.async {
    dynamo.booleanGet(id, "archived") map { archived =>
      respond(archived.getOrElse(false))
    } recover {
      case NoItemFound => respond(false)
    }
  }

  def setArchived(id: String) = Authenticated.async { req =>
    booleanForm.bindFromRequest()(req).fold(
      errors   =>
        Future.successful(BadRequest(errors.errorsAsJson)),
      archived =>
        dynamo.booleanSetOrRemove(id, "archived", archived) map publishAndRespond(id, respond(archived))
    )
  }

  def unsetArchived(id: String) = Authenticated.async {
    val response = respond(false)
    dynamo.removeKey(id, "archived") map publishAndRespond(id, response)
  }


  def getLabels(id: String) = Authenticated.async {
    dynamo.setGet(id, "labels")
      .map(labelsCollection(id, _))
      .map(respondCollection(_))
  }

  def addLabels(id: String) = Authenticated.async { req =>
    listForm.bindFromRequest()(req).fold(
      errors =>
        Future.successful(BadRequest(errors.errorsAsJson)),
      labels => {
        dynamo.setAdd(id, "labels", labels)
          .map(publishAndRespond(id, respondCollection(labelsCollection(id, labels.toSet), None, None)))
      }
    )
  }

  def removeLabel(id: String, label: String) = Authenticated.async {
    dynamo.setDelete(id, "labels", label) map publishAndRespond(id)
  }


  def getRights(id: String) = Authenticated.async {
    dynamo.setGet(id, "rights")
      .map(rightsCollection(id, _))
      .map(respondCollection(_))
  }

  def addRights(id: String) = Authenticated.async { req =>
    listForm.bindFromRequest()(req).fold(
      errors =>
        Future.successful(BadRequest(errors.errorsAsJson)),
      rights => {
        dynamo.setAdd(id, "rights", rights)
          .map(publishAndRespond(id, respondCollection(rightsCollection(id, rights.toSet), None, None)))
      }
    )
  }

  def removeRight(id: String, right: String) = Authenticated.async {
    dynamo.setDelete(id, "right", right) map publishAndRespond(id)
  }


  def getMetadata(id: String) = Authenticated.async {
    dynamo.jsonGet(id, "metadata").map { dynamoEntry =>
      val metadata = (dynamoEntry \ "metadata").as[ImageMetadata]
      respond(metadata)
    }
  }

  def setMetadata(id: String) = Authenticated.async(parse.json) { req =>
    metadataForm.bindFromRequest()(req).fold(
      errors => Future.successful(BadRequest(errors.errorsAsJson)),
      metadata =>
        dynamo.jsonAdd(id, "metadata", metadataAsMap(metadata))
          .map(publishAndRespond(id, respond(metadata)))
    )
  }

  def rightsCollection(id: String, rights: Set[String]): Seq[EmbeddedEntity[String]] =
    rights.map(Edits.setEntity(id, "rights", _)).toSeq

  def labelsCollection(id: String, labels: Set[String]): Seq[EmbeddedEntity[String]] =
    labels.map(Edits.setEntity(id, "labels", _)).toSeq

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

  // FIXME: At the moment we can't accept keywords as it is a list
  def metadataAsMap(metadata: ImageMetadata) =
    (Json.toJson(metadata).as[JsObject]-"keywords").as[Map[String, String]]

  // FIXME: Find a way to not have to write all this junk
  val metadataForm: Form[ImageMetadata] = Form(
    single("data" -> mapping(
      "dateTaken" -> optional(jodaDate),
      "description" -> optional(text),
      "credit" -> optional(text),
      "byline" -> optional(text),
      "bylineTitle" -> optional(text),
      "title" -> optional(text),
      "copyrightNotice" -> optional(text),
      "copyright" -> optional(text),
      "suppliersReference" -> optional(text),
      "source" -> optional(text),
      "specialInstructions" -> optional(text),
      "keywords" -> default(list(text), List()),
      "subLocation" -> optional(text),
      "city" -> optional(text),
      "state" -> optional(text),
      "country" -> optional(text)
    )(ImageMetadata.apply)(ImageMetadata.unapply))
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
