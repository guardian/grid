package controllers


import java.net.URI
import java.net.URLDecoder.decode

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.model.{UsageRights, ImageMetadata}

import scala.concurrent.Future

import play.api.data._, Forms._
import play.api.mvc.Controller
import play.api.libs.json._
import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.auth
import com.gu.mediaservice.lib.auth.KeyStore
import com.gu.mediaservice.lib.aws.{NoItemFound, DynamoDB}
import lib._

import model.Edits

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import scala.util.{Success, Failure, Try}


// FIXME: the argoHelpers are all returning `Ok`s (200)
// Some of these responses should be `Accepted` (202)
// TODO: Look at adding actions e.g. to collections / sets where we could `PUT`
// a singular collection item e.g.
// {
//   "labels": {
//     "uri": "...",
//     "data": [],
//     "actions": [
//       {
//         "method": "PUT",
//         "rel": "create",
//         "href": "../metadata/{id}/labels/{label}"
//       }
//     ]
//   }
// }
object Application extends Controller with ArgoHelpers {

  import Config.{rootUri, loginUri, kahunaUri}

  val keyStore = new KeyStore(Config.keyStoreBucket, Config.awsCredentials)
  val Authenticated = auth.Authenticated(keyStore, loginUri, kahunaUri)

  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)

  // TODO: add links to the different responses esp. to the reference image
  val indexResponse = {
    val indexData = Map("description" -> "This is the Metadata Editor Service")
    val indexLinks = List(
      Link("edits",       s"$rootUri/metadata/{id}"),
      Link("archived",    s"$rootUri/metadata/{id}/archived"),
      Link("labels",      s"$rootUri/metadata/{id}/labels"),
      Link("rights",      s"$rootUri/metadata/{id}/rights"),
      Link("usageRights", s"$rootUri/metadata/{id}/usage-rights"),
      Link("metadata",    s"$rootUri/metadata/{id}/metadata")
    )
    respond(indexData, indexLinks)
  }

  def index = Authenticated { indexResponse }

  def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$rootUri/metadata/$id$endpoint")

  def decodeUriParam(param: String): String = decode(param, "UTF-8")

  // TODO: Think about calling this `overrides` or something that isn't metadata
  def getAllMetadata(id: String) = Authenticated.async {
    dynamo.get(id) map { dynamoEntry =>

      val edits = dynamoEntry.as[Edits]

      // We have to do the to JSON here as we are using a custom JSON writes.
      // TODO: have the argo helpers allow you to do this
      respond(Json.toJson(edits)(Edits.EditsWritesArgo(id)))

    } recover {
      // Empty object as no metadata edits recorded
      case NoItemFound =>
        respond(Json.toJson(Edits.getEmpty)(Edits.EditsWritesArgo(id)))
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
        dynamo.booleanSetOrRemove(id, "archived", archived)
          .map(publish(id))
          .map(edits => respond(edits.archived))
    )
  }

  def unsetArchived(id: String) = Authenticated.async {
    dynamo.removeKey(id, "archived")
      .map(publish(id))
      .map(_ => respond(false))
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
        dynamo
          .setAdd(id, "labels", labels)
          .map(publish(id))
          .map(edits => respondCollection(labelsCollection(id, edits.labels.toSet)))
      }
    )
  }

  def removeLabel(id: String, label: String) = Authenticated.async {
    dynamo.setDelete(id, "labels", decodeUriParam(label))
      .map(publish(id))
      .map(edits => respondCollection(labelsCollection(id, edits.labels.toSet)))
  }


  def getRights(id: String) = Authenticated.async {
    dynamo.setGet(id, "rights")
      .map(rightsCollection(id, _))
      .map(respondCollection(_))
  }

  def addRights(id: String) = Authenticated.async { req =>
    rightsForm.bindFromRequest()(req).fold(
      form => {
        val errorMessage = getDataListFormError(form)
        Future.successful(respondError(BadRequest, "invalid-rights-data", errorMessage))
      },
      rights =>
        dynamo.setAdd(id, "rights", rights)
          .map(publish(id))
          .map(edits => respondCollection(rightsCollection(id, edits.rights.toSet)))
    )
  }

  def removeRight(id: String, right: String) = Authenticated.async {
    dynamo.setDelete(id, "rights", decodeUriParam(right))
      .map(publish(id))
      .map(edits => respondCollection(rightsCollection(id, edits.rights.toSet)))
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
          .map(publish(id))
          .map(edits => respond(edits.metadata))
    )
  }


  def getUsageRights(id: String) = Authenticated.async {
    dynamo.jsonGet(id, "usageRights").map { dynamoEntry =>
      val usageRights = (dynamoEntry \ "usageRights").as[UsageRights]
      respond(usageRights)
    }
  }

  def setUsageRights(id: String) = Authenticated.async(parse.json) { req =>
    bindFromRequest[UsageRights](req.body) match {
      case Success(usageRights) =>
        dynamo.jsonAdd(id, "usageRights", caseClassToMap(usageRights))
          .map(publish(id))
          .map(edits => respond(usageRights))

      case Failure(e) =>
        Future.successful(respondError(BadRequest, "bad-form-data", "Invalid form data"))
    }
  }

  def deleteUsageRights(id: String) = Authenticated.async { req =>
    dynamo.removeKey(id, "usageRights").map(publish(id)).map(edits => Accepted)
  }
  

  def bindFromRequest[T](json: JsValue)(implicit fjs: Reads[T]): Try[T] =
    Try((json \ "data").as[T])

  // TODO: Move this to the dynamo lib
  def caseClassToMap[T](caseClass: T)(implicit tjs: Writes[T]): Map[String, String] =
    Json.toJson[T](caseClass).as[JsObject].as[Map[String, String]]

  def rightsCollection(id: String, rights: Set[String]): Seq[EmbeddedEntity[String]] =
    rights.map(Edits.setUnitEntity(id, "rights", _)).toSeq

  def labelsCollection(id: String, labels: Set[String]): Seq[EmbeddedEntity[String]] =
    labels.map(Edits.setUnitEntity(id, "labels", _)).toSeq


  def publish(id: String)(metadata: JsObject): Edits = {
    val message = Json.obj(
      "id" -> id,
      "data" -> metadata
    )
    Notifications.publish(message, "update-image-user-metadata")

    metadata.as[Edits]
  }


  // This get's the form error based on out data structure that we send over i.e.
  // { "data": {data} }
  def getDataListFormError(form: Form[List[String]]): String = {
    def printData(data: Map[String, String]): String = {
      data.map{case(k, v) => v}.toList.mkString(", ")
    }
    // only use the head error as they are going to be the same
    val message = form.errors.headOption
                      .map(_.message + s", given data: ${printData(form.data)}")
                      .getOrElse(s"Unknown error, given data: ${printData(form.data)}")
    message
  }

  // FIXME: At the moment we can't accept keywords as it is a list
  def metadataAsMap(metadata: ImageMetadata) =
    (Json.toJson(metadata).as[JsObject]-"keywords").as[Map[String, String]]

  // FIXME: Find a way to not have to write all this junk
  // We can use the new bindFromRequest as we've done most the grunt work in the
  // JSON combinators
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
      "supplier" -> optional(text),
      "collection" -> optional(text),
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

  val rightsForm: Form[List[String]] = Form(
     single[List[String]](
      "data" -> list(text.verifying(
        s"Invalid rights values. Rights allowed are: ${Config.freeRights.mkString(", ")}",
        Config.freeRights.contains(_))))
  )

}
