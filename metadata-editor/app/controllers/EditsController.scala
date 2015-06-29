package controllers


import java.net.URI
import java.net.URLDecoder.decode

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.config.UsageRightsConfig
import com.gu.mediaservice.model.{Conditional, UsageRights, ImageMetadata, Edits}

import scala.concurrent.Future

import play.api.data._, Forms._
import play.api.mvc.Controller
import play.api.libs.json._
import play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.lib.aws.{NoItemFound, DynamoDB}
import lib._

import com.gu.mediaservice.lib.argo._
import com.gu.mediaservice.lib.argo.model._

import scala.util.{Success, Failure, Try}
import scalaz.Validation
import scalaz.syntax.validation._


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

object EditsController extends Controller with ArgoHelpers {

  import Config.rootUri

  val Authenticated = EditsApi.Authenticated
  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)

  def entityUri(id: String, endpoint: String = ""): URI =
    URI.create(s"$rootUri/metadata/$id$endpoint")

  def decodeUriParam(param: String): String = decode(param, "UTF-8")

  // TODO: Think about calling this `overrides` or something that isn't metadata
  def getAllMetadata(id: String) = Authenticated.async {
    dynamo.get(id) map { dynamoEntry =>

      val edits = dynamoEntry.as[Edits]

      // We have to do the to JSON here as we are using a custom JSON writes.
      // TODO: have the argo helpers allow you to do this
      respond(Json.toJson(edits)(EditsResponse.editsResponseWrites(id)))

    } recover {
      // Empty object as no metadata edits recorded
      case NoItemFound =>
        respond(Json.toJson(Edits.getEmpty)(EditsResponse.editsResponseWrites(id)))
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
      .map {case (uri, labels) => respondCollection(labels)}
  }

  def addLabels(id: String) = Authenticated.async { req =>
    listForm.bindFromRequest()(req).fold(
      errors =>
        Future.successful(BadRequest(errors.errorsAsJson)),
      labels => {
        dynamo
          .setAdd(id, "labels", labels)
          .map(publish(id))
          .map(edits => labelsCollection(id, edits.labels.toSet))
          .map {case (uri, labels) => respondCollection(labels)}
      }
    )
  }

  def removeLabel(id: String, label: String) = Authenticated.async {
    dynamo.setDelete(id, "labels", decodeUriParam(label))
      .map(publish(id))
      .map(edits => labelsCollection(id, edits.labels.toSet))
      .map {case (uri, labels) => respondCollection(labels, uri=Some(uri))}
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

    bindFromRequest[UsageRights](req.body).flatMap(EditsValidator(_)).fold(
      e => Future.successful(respondError(BadRequest, e.key, e.message)),

      usageRights =>
        dynamo.jsonAdd(id, "usageRights", caseClassToMap(usageRights))
          .map(publish(id))
          .map(edits => respond(usageRights))
    )
  }

  def deleteUsageRights(id: String) = Authenticated.async { req =>
    dynamo.removeKey(id, "usageRights").map(publish(id)).map(edits => Accepted)
  }

  def bindFromRequest[T](json: JsValue)(implicit fjs: Reads[T]): Validation[EditsValidationError, T] =
    (json \ "data").asOpt[T]
      .map(_.success)
      .getOrElse(EditsValidationError("unrecognised-form-data", "Unrecognised form data").fail)

  // TODO: Move this to the dynamo lib
  def caseClassToMap[T](caseClass: T)(implicit tjs: Writes[T]): Map[String, String] =
    Json.toJson[T](caseClass).as[JsObject].as[Map[String, String]]

  def labelsCollection(id: String, labels: Set[String]): (URI, Seq[EmbeddedEntity[String]]) = {
    val labelsUri = EditsResponse.entityUri(id, "/labels")
    (labelsUri, labels.map(EditsResponse.setUnitEntity(id, "labels", _)).toSeq)
  }


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
      "dateTaken" -> trueOptional(jodaDate),
      "description" -> trueOptional(text),
      "credit" -> trueOptional(text),
      "creditUri" -> trueOptional(text),
      "byline" -> trueOptional(text),
      "bylineTitle" -> trueOptional(text),
      "title" -> trueOptional(text),
      "copyrightNotice" -> trueOptional(text),
      "copyright" -> trueOptional(text),
      "suppliersReference" -> trueOptional(text),
      "source" -> trueOptional(text),
      "specialInstructions" -> trueOptional(text),
      "keywords" -> default(list(text), List()),
      "subLocation" -> trueOptional(text),
      "city" -> trueOptional(text),
      "state" -> trueOptional(text),
      "country" -> trueOptional(text)
    )(ImageMetadata.apply)(ImageMetadata.unapply))
  )

  def trueOptional[T](mapping: Mapping[T]) = TrueOptionalMapping(mapping)

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

case class EditsValidationError(key: String, message: String) extends Throwable

object EditsValidator {

  def apply(usageRights: UsageRights): Validation[EditsValidationError, UsageRights] = {
    val cost = UsageRightsConfig.categoryCosts.get(usageRights.category)

    // Look to see if we have Some(" ") or equivalent, remove it, and return the
    // cleaned usageRights, or error on having no restrictions when required
    val cleanUsageRights = usageRights.copy(restrictions = emptyOptStringToNone(usageRights.restrictions))
    val missingRestriction = missingRestrictions(cleanUsageRights)

    if (missingRestriction) {
      EditsValidationError("invalid-form-data", s"${usageRights.category} must have restrictions set").fail
    } else {
      cleanUsageRights.success
    }
  }

  def missingRestrictions(usageRights: UsageRights): Boolean = {
    val cost = UsageRightsConfig.categoryCosts.get(usageRights.category)
    cost.contains(Conditional) && usageRights.restrictions.isEmpty && usageRights.category.flatMap(_.defaultRestrictions).isEmpty
  }

  private def emptyOptStringToNone(s: Option[String]) =
    s.map(_.trim).filterNot(_.isEmpty)
}
