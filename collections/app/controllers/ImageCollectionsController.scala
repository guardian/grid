package controllers

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global

import org.joda.time.DateTime
import play.api.libs.json.{Json, JsObject}
import play.api.mvc.Controller

import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.lib.aws.{NoItemFound, DynamoDB}
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.model.{ActionData, Collection}

import lib.{Config, ControllerHelper}


object ImageCollectionsController extends Controller with ArgoHelpers {

  import ControllerHelper.getUserFromReq
  import CollectionsManager.onlyLatest

  val Authenticated = ControllerHelper.Authenticated
  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.imageCollectionsTable)

  def getCollections(id: String) = Authenticated.async { req =>
    dynamo.listGet[Collection](id, "collections").map { dynamoEntry =>
      respond(onlyLatest(dynamoEntry))
    } recover {
      case NoItemFound => respondNotFound("No usage rights overrides found")
    }
  }

  def addCollection(id: String) = Authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[List[String]].map { path =>
      val collection = Collection(path, ActionData(getUserFromReq(req), DateTime.now()))
      dynamo.listAdd(id, "collections", collection)
        .map(publish(id))
        .map(edits => respond(collection))
    } getOrElse Future.successful(respondError(BadRequest, "invalid-form-data", "Invalid form data"))
  }

  def publish(id: String)(json: JsObject): List[Collection] = {

    val collections = (json \ "collections").as[List[Collection]]
    val message = Json.obj(
      "id" -> id,
      "data" -> Json.toJson(collections)
    )
//
//    Notifications.publish(message, "update-image-user-metadata")

    collections
  }
}



