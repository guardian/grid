package controllers

import java.net.URI

import com.gu.mediaservice.lib.argo.model.{Link, EmbeddedEntity, Action}
import com.gu.mediaservice.lib.collections.CollectionsManager

import lib.ControllerHelper
import model.Node
import org.joda.time.DateTime

import play.api.libs.functional.syntax._
import play.api.libs.json._
import play.api.mvc.Controller

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.model.{ActionData, Collection}

import store.{CollectionsStoreError, CollectionsStore}


case class InvalidPrinciple(message: String) extends Throwable
case class AppIndex(name: String, description: String, config: Map[String, String] = Map())

object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

object CollectionsController extends Controller with ArgoHelpers {

  import lib.Config.rootUri
  import ControllerHelper.getUserFromReq
  import CollectionsManager.{pathToUri, uriToPath, isValidPathBit}

  val Authenticated = ControllerHelper.Authenticated

  def uri(u: String) = URI.create(u)
  val collectionUri = uri(s"$rootUri/collections")
  def collectionUri(p: List[String] = Nil) = {
    val path = if(p.nonEmpty) s"/${pathToUri(p)}" else ""
    uri(s"$rootUri/collections$path")
  }

  val appIndex = AppIndex("media-collections", "The one stop shop for collections")
  val indexLinks = List(Link("collections", collectionUri.toString))

  def addChildAction(pathId: List[String] = Nil): Option[Action] = Some(Action("add-child", collectionUri(pathId), "POST"))
  def addChildAction(n: Node[Collection]): Option[Action] = addChildAction(n.fullPath)
  def removeNodeAction(n: Node[Collection]) = if (n.children.nonEmpty) None else Some(
    Action("remove", collectionUri(n.fullPath), "DELETE")
  )

  def index = Authenticated { req =>
    respond(appIndex, links = indexLinks)
  }

  def collectionNotFound(path: String) =
    respondError(NotFound, "collection-not-found", s"Could not find collection: $path")

  def invalidJson(json: JsValue) =
    respondError(BadRequest, "invalid-json", s"Could not parse json: ${json.toString}")

  def storeError(message: String) =
    respondError(InternalServerError, "collection-store-error", message)

  def getActions(n: Node[Collection]): List[Action] = {
    List(addChildAction(n), removeNodeAction(n)).flatten
  }

  def listCollections = Authenticated.async { req =>
    CollectionsStore.getAll map { collections =>
      respond(collections.sortBy(_.pathId))
    }
  }

  def getCollections = Authenticated.async { req =>
    CollectionsStore.getAll map { collections =>
      val tree = Node.fromList[Collection](
        collections,
        (collection) => collection.path)

//      respond(Json.toJson(tree)(asArgo), actions = List(addChildAction()).flatten)

      respond(tree)
    } recover {
      case e: CollectionsStoreError => storeError(e.message)
    }
  }

  // Basically default parameters, which Play doesn't support
  def addChildToRoot = addChildTo(None)
  def addChildToCollection(collectionPathId: String) = addChildTo(Some(collectionPathId))
  def addChildTo(collectionPathId: Option[String]) = Authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[String] map { child =>
      if (isValidPathBit(child)) {
        val path = collectionPathId.map(uriToPath).getOrElse(Nil) :+ child
        val collection = Collection.build(path, ActionData(getUserFromReq(req), DateTime.now))
        CollectionsStore.add(collection).map { collection =>
          val node = Node(collection.path.last, Nil, collection.path, Some(collection))
          respond(node, actions = getActions(node))
        } recover {
          case e: CollectionsStoreError => storeError(e.message)
        }
      } else {
        Future.successful(respondError(BadRequest, "invalid-input", "You cannot have slashes in your path name"))
      }
    } getOrElse Future.successful(invalidJson(req.body))
  }

  def removeCollection(collectionPath: String) = Authenticated.async { req =>
    CollectionsStore.remove(CollectionsManager.uriToPath(collectionPath)) map { unit =>
      Accepted
    } recover {
      case e: CollectionsStoreError => InternalServerError
    }
  }

  // We have to do this as Play's serialisation doesn't work all that well.
  // Especially around types with subtypes, so we have to be very explicit here.
  implicit def collectionEntityWrites: Writes[Node[EmbeddedEntity[Collection]]] = (
    (__ \ "name").write[String] ~
    (__ \ "children").lazyWrite(Writes.seq[Node[EmbeddedEntity[Collection]]](collectionEntityWrites)) ~
    (__ \ "fullPath").write[List[String]] ~
    (__ \ "data").writeNullable[EmbeddedEntity[Collection]]
  )(node => (node.basename, node.children, node.fullPath, node.data))

  type CollectionsEntity = Seq[EmbeddedEntity[Node[Collection]]]
  implicit def asArgo: Writes[Node[Collection]] = (
    (__ \ "basename").write[String] ~
      (__ \ "children").lazyWrite[CollectionsEntity](Writes[CollectionsEntity]
          // This is so we don't have to rewrite the Write[Seq[T]]
          (seq => Json.toJson(seq))).contramap(collectionsEntity) ~
      (__ \ "fullPath").write[List[String]] ~
      (__ \ "data").writeNullable[Collection]
    )(node => (node.basename, node.children, node.fullPath, node.data))


  def collectionsEntity(nodes: List[Node[Collection]]): CollectionsEntity = {
    nodes.map(n => EmbeddedEntity(collectionUri(n.fullPath), Some(n), actions = getActions(n)))
  }

}



