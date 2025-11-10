package controllers


import java.net.URI
import java.net.URLDecoder.decode

import com.amazonaws.AmazonServiceException
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model._
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.EditMetadata
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.aws.NoItemFound
import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.model._
import com.gu.mediaservice.syntax.MessageSubjects
import lib._
import lib.Edit
import org.joda.time.DateTime
import play.api.libs.json._
import play.api.libs.ws.WSClient
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.compat._


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

class EditsController(
                       auth: Authentication,
                       val editsStore: EditsStore,
                       val notifications: Notifications,
                       val config: EditsConfig,
                       ws: WSClient,
                       authorisation: Authorisation,
                       override val controllerComponents: ControllerComponents
                     )(implicit val ec: ExecutionContext)
  extends BaseController with ArgoHelpers with EditsResponse with MessageSubjects with Edit {

  import com.gu.mediaservice.lib.metadata.UsageRightsMetadataMapper.usageRightsToMetadata

  val services: Services = new Services(config.domainRoot, config.serviceHosts, Set.empty)
  val gridClient: GridClient = GridClient(services)(ws)

  val metadataBaseUri = config.services.metadataBaseUri
  private val AuthenticatedAndAuthorised = auth andThen authorisation.CommonActionFilters.authorisedForArchive

  private def getUploader(imageId: String, user: Principal): Future[Option[String]] = gridClient.getUploadedBy(imageId, auth.getOnBehalfOfPrincipal(user))

  private def authorisedForEditMetadataOrUploader(imageId: String) = authorisation.actionFilterForUploaderOr(imageId, EditMetadata, getUploader)

  def decodeUriParam(param: String): String = decode(param, "UTF-8")

  // TODO: Think about calling this `overrides` or something that isn't metadata
  def getAllMetadata(id: String) = auth.async {
    val emptyResponse = respond(Edits.getEmpty)(editsEntity(id))
    editsStore.getV2(id) map { record =>
      record
        .map(respond(_)(editsEntity(id)))
        .getOrElse(emptyResponse)
    }
  }

  def getEdits(id: String) = auth.async {
    editsStore.getV2(id) map { record =>
      respond(data = record)
    } recover { case NoItemFound => NotFound }
  }

  def getArchived(id: String) = auth.async {
    editsStore.getV2(id) map { record =>
      respond(record.exists(_.archived))
    }
  }

  def setArchived(id: String) = AuthenticatedAndAuthorised.async(parse.json) { implicit req =>
    (req.body \ "data").validate[Boolean].fold(
      errors =>
        Future.successful(BadRequest(errors.toString())),
      archived =>
        editsStore.setOrRemoveArchivedV2(id, archived)
          .map(e => publishV2(id, UpdateImageUserMetadata)(e))
          .map(edits => respond(edits.archived))
    )
  }

  def unsetArchived(id: String) = auth.async {
    editsStore.setOrRemoveArchivedV2(id, false)
      .map(e => publishV2(id, UpdateImageUserMetadata)(e))
      .map(edits => respond(false))
  }


  def getLabels(id: String) = auth.async {
    editsStore.getV2(id)
      .map(record =>
        record.fold(respond(Array[String]())){ e =>
          val (_, labels) = labelsCollection(id, e.labels.toSet)
          respondCollection(labels)
        }
      )
  }

  def addLabels(id: String) = auth.async(parse.json) { req =>
    (req.body \ "data").validate[List[String]].fold(
      errors => {
        Future.successful(BadRequest(errors.toString()))
      },
      labels => {
        editsStore
          .updateKeyV2(id, Edits.Labels, labels)
          .map(e => {
            val edits = publishV2(id, UpdateImageUserMetadata)(e)
            val (_, l) = labelsCollection(id, edits.labels.toSet)
            respondCollection(l)
          })

      }
    )
  }

  def removeLabel(id: String, label: String) = auth.async {
    editsStore.removeKeyV2(id, Edits.Labels)
      .map(e => {
        publishV2(id, UpdateImageUserMetadata)(e)
      })
      .map(edits => labelsCollection(id, edits.labels.toSet))
      .map {case (uri, labels) => respondCollection(labels, uri=Some(uri))}
  }


  def getMetadata(id: String) = auth.async {
    editsStore.getV2(id).map { recordOpt =>
      recordOpt.fold(
        respond(Json.toJson(JsObject(Nil)))
      )(record => {
        respond(record.metadata)
      })
    }
  }

  def setMetadata(id: String) = (auth andThen authorisedForEditMetadataOrUploader(id)).async(parse.json) { req =>
    (req.body \ "data").validate[ImageMetadata].fold(
      errors => Future.successful(BadRequest(errors.toString())),
      metadata => {
        val specsAsMap = config.domainMetadataSpecs.groupBy(_.name).view.mapValues(_.flatMap(_.fields.map(_.name))).toMap
        val validatedDomainMetadata = metadata.domainMetadata
          .view
          .filterKeys(specsAsMap.keySet)
          .toMap
          .flatMap(specData => {
            val fields = specsAsMap.getOrElse(specData._1, List())
            Map(specData._1 -> specData._2.view.filterKeys(fields.toSet).toMap)
          })

        val validatedMetadata = metadata.copy(domainMetadata = validatedDomainMetadata)
        editsStore.updateKeyV2(id, Edits.Metadata, validatedMetadata)
          .map(publishV2(id, UpdateImageUserMetadata))
          .map(edits => respond(edits.metadata))
      }
    )
  }

  def setMetadataFromUsageRights(id: String) = (auth andThen authorisedForEditMetadataOrUploader(id)).async { req =>
    editsStore.getV2(id) flatMap { dynamoEntry =>
      dynamoEntry.fold(
        Future.successful(respondError(NotFound, "item-not-found", "Could not find image"))
      )(edits => {
        gridClient.getMetadata(id, auth.getOnBehalfOfPrincipal(req.user)) flatMap { imageMetadata =>
          val originalUserMetadata = edits.metadata
          val staffPhotographerPublications: Set[String] = config.usageRightsConfig.staffPhotographers.map(_.name).toSet
          val metadataOpt = edits.usageRights.flatMap(ur => usageRightsToMetadata(ur, imageMetadata, staffPhotographerPublications))

          metadataOpt map { metadata =>
            val mergedMetadata = originalUserMetadata.copy(
              byline = metadata.byline orElse originalUserMetadata.byline,
              credit = metadata.credit orElse originalUserMetadata.credit,
              copyright = metadata.copyright orElse originalUserMetadata.copyright,
              imageType = metadata.imageType orElse originalUserMetadata.imageType
            )

            editsStore.updateKeyV2(id, Edits.Metadata,  mergedMetadata)
              .map(publishV2(id, UpdateImageUserMetadata))
              .map(edits => respond(edits.metadata, uri = Some(metadataUri(id))))
          } getOrElse {
            // just return the unmodified
            Future.successful(respond(edits.metadata, uri = Some(metadataUri(id))))
          }
        }
    })
  }}

  def getUsageRights(id: String) = auth.async {
    editsStore.getV2(id).map(_.fold(
        respondNotFound("No usage rights overrides found")
    )(edits => {
        respond(edits.usageRights)
    }))
  }

  def setUsageRights(id: String) = auth.async(parse.json) { req =>
    (req.body \ "data").asOpt[UsageRights].map(usageRight => {
      editsStore.updateKeyV2(id, Edits.UsageRights, usageRight)
        .map(publishV2(id, UpdateImageUserMetadata))
        .map(_ => respond(usageRight))
    }).getOrElse(Future.successful(respondError(BadRequest, "invalid-form-data", "Invalid form data")))
  }

  def deleteUsageRights(id: String) = auth.async { req =>
    editsStore.removeKeyV2(id, Edits.UsageRights).map(publishV2(id, UpdateImageUserMetadata)).map(edits => Accepted)
  }

  def labelsCollection(id: String, labels: Set[String]): (URI, Seq[EmbeddedEntity[String]]) =
    (labelsUri(id), labels.map(setUnitEntity(id, Edits.Labels, _)).toSeq)

}
