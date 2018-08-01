package controllers


import java.net.URI
import java.net.URLDecoder.decode

import com.amazonaws.AmazonServiceException
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.aws.NoItemFound
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.model._
import lib._
import org.joda.time.DateTime
import play.api.Logger
import play.api.data.Forms._
import play.api.data._
import play.api.libs.json._
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}


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

class EditsController(auth: Authentication, store: EditsStore, notifications: Notifications, config: EditsConfig,
                      override val controllerComponents: ControllerComponents)(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers with EditsResponse {

  import UsageRightsMetadataMapper.usageRightsToMetadata

  val metadataBaseUri = config.services.metadataBaseUri

  def decodeUriParam(param: String): String = decode(param, "UTF-8")

  // TODO: Think about calling this `overrides` or something that isn't metadata
  def getAllMetadata(id: String) = auth.async {
    val emptyResponse = respond(Edits.getEmpty)(editsEntity(id))
    store.get(id) map { dynamoEntry =>
      dynamoEntry.asOpt[Edits]
        .map(respond(_)(editsEntity(id)))
        .getOrElse(emptyResponse)
    } recover { case NoItemFound => emptyResponse }
  }

  def getArchived(id: String) = auth.async {
    store.booleanGet(id, "archived") map { archived =>
      respond(archived.getOrElse(false))
    } recover {
      case NoItemFound => respond(false)
    }
  }

  def setArchived(id: String) = auth.async(parse.json) { implicit req =>
    (req.body \ "data").validate[Boolean].fold(
      errors =>
        Future.successful(BadRequest(errors.toString())),
      archived =>
        store.booleanSetOrRemove(id, "archived", archived)
          .map(publish(id))
          .map(edits => respond(edits.archived))
    )
  }

  def unsetArchived(id: String) = auth.async {
    store.removeKey(id, "archived")
      .map(publish(id))
      .map(_ => respond(false))
  }


  def getLabels(id: String) = auth.async {
    store.setGet(id, "labels")
      .map(labelsCollection(id, _))
      .map {case (uri, labels) => respondCollection(labels)} recover {
      case NoItemFound => respond(Array[String]())
    }
  }

  def getAlbum(id: String) = auth.async {
    store.jsonGet(id, "album").map(dynamoEntry => {
      (dynamoEntry \ "album").toOption match {
        case Some(album) => respond(album.as[Album])
        case None => respondNotFound("No album found")
      }
    }) recover {
      case NoItemFound => respondNotFound("No album found")
    }
  }

  def setAlbum(id: String) = auth.async(parse.json) { req => {
    (req.body \ "data").asOpt[Album].map(album => {
      store.jsonAdd(id, "album", caseClassToMap(album))
        .map(publish(id, "update-image-album"))
        .map(_ => respond(album))
    }).getOrElse(
      Future.successful(respondError(BadRequest, "invalid-form-data", "Invalid form data"))
    )
  }}

  def deleteAlbum(id: String) = auth.async {
    store.removeKey(id, "album").map(publish(id, "update-image-album")).map(_ => Accepted)
  }

  def addLabels(id: String) = auth.async(parse.json) { req =>
    (req.body \ "data").validate[List[String]].fold(
      errors =>
        Future.successful(BadRequest(errors.toString())),
      labels =>
        store
          .setAdd(id, "labels", labels)
          .map(publish(id))
          .map(edits => labelsCollection(id, edits.labels.toSet))
          .map { case (uri, l) => respondCollection(l) } recover {
            case _: AmazonServiceException => BadRequest
          }
    )
  }

  def removeLabel(id: String, label: String) = auth.async {
    store.setDelete(id, "labels", decodeUriParam(label))
      .map(publish(id))
      .map(edits => labelsCollection(id, edits.labels.toSet))
      .map {case (uri, labels) => respondCollection(labels, uri=Some(uri))}
  }


  def getMetadata(id: String) = auth.async {
    store.jsonGet(id, "metadata").map { dynamoEntry =>
      val metadata = (dynamoEntry \ "metadata").as[ImageMetadata]
      respond(metadata)
    } recover {
      case NoItemFound => respond(Json.toJson(JsObject(Nil)))
    }
  }

  def setMetadata(id: String) = auth.async(parse.json) { req =>
    (req.body \ "data").validate[ImageMetadata].fold(
      errors => Future.successful(BadRequest(errors.toString())),
      metadata =>
        store.jsonAdd(id, "metadata", metadataAsMap(metadata))
          .map(publish(id))
          .map(edits => respond(edits.metadata))
    )
  }

  def setMetadataFromUsageRights(id: String) = auth.async { req =>
    store.get(id) flatMap { dynamoEntry =>
      val edits = dynamoEntry.as[Edits]
      val originalMetadata = edits.metadata
      val metadataOpt = edits.usageRights.flatMap(usageRightsToMetadata)

      metadataOpt map { metadata =>
        val mergedMetadata = originalMetadata.copy(
          byline = metadata.byline orElse originalMetadata.byline,
          credit = metadata.credit orElse originalMetadata.credit
        )

        store.jsonAdd(id, "metadata", metadataAsMap(mergedMetadata))
          .map(publish(id))
          .map(edits => respond(edits.metadata, uri = Some(metadataUri(id))))
      } getOrElse {
        // just return the unmodified
        Future.successful(respond(edits.metadata, uri = Some(metadataUri(id))))
      }
    } recover {
      case NoItemFound => respondError(NotFound, "item-not-found", "Could not find image")
    }
  }

  def getUsageRights(id: String) = auth.async {
    store.jsonGet(id, "usageRights").map { dynamoEntry =>
      val usageRights = (dynamoEntry \ "usageRights").as[UsageRights]
      respond(usageRights)
    } recover {
      case NoItemFound => respondNotFound("No usage rights overrides found")
    }
  }

  def setUsageRights(id: String) = auth.async(parse.json) { req =>
    (req.body \ "data").asOpt[UsageRights].map(usageRight => {
      store.jsonAdd(id, "usageRights", caseClassToMap(usageRight))
        .map(publish(id))
        .map(edits => respond(usageRight))
    }).getOrElse(Future.successful(respondError(BadRequest, "invalid-form-data", "Invalid form data")))
  }

  def deleteUsageRights(id: String) = auth.async { req =>
    store.removeKey(id, "usageRights").map(publish(id)).map(edits => Accepted)
  }

  // TODO: Move this to the dynamo lib
  def caseClassToMap[T](caseClass: T)(implicit tjs: Writes[T]): Map[String, String] =
    Json.toJson[T](caseClass).as[JsObject].as[Map[String, String]]

  def labelsCollection(id: String, labels: Set[String]): (URI, Seq[EmbeddedEntity[String]]) =
    (labelsUri(id), labels.map(setUnitEntity(id, "labels", _)).toSeq)

  def publish(id: String, subject: String = "update-image-user-metadata")(metadata: JsObject): Edits = {
    val edits = metadata.as[Edits]
    val message = Json.obj(
      "id" -> id,
      "data" -> Json.toJson(edits),
      "lastModified" -> printDateTime(new DateTime())
    )

    notifications.publish(message, subject)

    edits
  }

  // FIXME: At the moment we can't accept keywords as it is a list
  def metadataAsMap(metadata: ImageMetadata) =
    (Json.toJson(metadata).as[JsObject]-"keywords").as[Map[String, String]]


}

case class EditsValidationError(key: String, message: String) extends Throwable
