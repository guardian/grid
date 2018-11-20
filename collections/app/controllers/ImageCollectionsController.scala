package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.getEmail
import com.gu.mediaservice.lib.aws.{DynamoDB, NoItemFound}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.{ActionData, Collection}
import com.gu.mediaservice.lib.net.{URI => UriOps}
import lib.{CollectionsConfig, Notifications}
import org.joda.time.DateTime
import play.api.libs.json.Json
import play.api.mvc.{BaseController, ControllerComponents}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future


class ImageCollectionsController(authenticated: Authentication, config: CollectionsConfig, notifications: Notifications,
                                 override val controllerComponents: ControllerComponents)
  extends BaseController with ArgoHelpers {

  import CollectionsManager.onlyLatest

  val dynamo = new DynamoDB(config, config.imageCollectionsTable)

  def getCollections(id: String) = authenticated.async { req =>
    dynamo.listGet[Collection](id, "collections").map { collections =>
      respond(onlyLatest(collections))
    } recover {
      case NoItemFound => respondNotFound("No collections found")
    }
  }

  def addCollection(id: String) = authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[List[String]].map { path =>
      val collection = Collection.build(path, ActionData(getEmail(req.user), DateTime.now()))
      dynamo.listAdd(id, "collections", collection)
        .map(publish(id))
        .map(cols => respond(collection))
    } getOrElse Future.successful(respondError(BadRequest, "invalid-form-data", "Invalid form data"))
  }


  def removeCollection(id: String, collectionString: String) = authenticated.async { req =>
    val path = CollectionsManager.uriToPath(UriOps.encodePlus(collectionString))
    // We do a get to be able to find the index of the current collection, then remove it.
    // Given that we're using Dynamo Lists this seemed like a decent way to do it.
    // Dynamo Lists, like other lists do respect order.
    dynamo.listGet[Collection](id, "collections") flatMap { collections =>
      CollectionsManager.findIndexes(path, collections) match {
        case Nil =>
          Future.successful(respondNotFound(s"Collection $collectionString not found"))
        case indexes =>
          dynamo.listRemoveIndexes[Collection](id, "collections", indexes)
            .map(publish(id))
            .map(cols => respond(cols))
      }
    } recover {
      case NoItemFound => respondNotFound("No collections found")
    }
  }

  def publish(id: String)(collections: List[Collection]): List[Collection] = {
    val onlyLatestCollections = onlyLatest(collections)
    val message = Json.obj(
      "id" -> id,
      "data" -> Json.toJson(onlyLatestCollections)
    )

    notifications.publish(message, "set-image-collections")
    onlyLatestCollections
  }
}



