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

import store.CollectionsStore

case class AppIndex(name: String, description: String, config: Map[String, String] = Map(),
                    links: List[Link] = Nil, actions: List[Action] = Nil)
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

object CollectionsController extends Controller with ArgoHelpers {

  import lib.Config.rootUri
  import ControllerHelper.getUserFromReq

  val Authenticated = ControllerHelper.Authenticated

  def uri(u: String) = URI.create(u)
  val collectionUri = uri(s"$rootUri/collections")
  def collectionUri(s: String = "") = {
    val post = if(s.nonEmpty) s"/$s" else s
    uri(s"$rootUri/collections$post")
  }

  val appIndex = AppIndex("media-collections", "The one stop shop for collections",
                  links = List(Link("collections", collectionUri.toString)))

  def addChildAction(pathId: String = ""): Option[Action] = Some(Action("add-child", collectionUri(pathId), "POST"))
  def addChildAction(n: Node[Collection]): Option[Action] = addChildAction(n.pathId)
  def removeNodeAction(n: Node[Collection]) = if (n.children.nonEmpty) None else Some(
    Action("remove", collectionUri(n.pathId), "DELETE")
  )

  def index = Authenticated { req =>
    respond(appIndex)
  }

  def collectionNotFound(path: String) =
    respondError(NotFound, "collection-not-found", s"Could not find collection: $path")

  def invalidJson(json: JsValue) =
    respondError(BadRequest, "invalid-json", s"Could not parse json: ${json.toString}")

  def getActions(n: Node[Collection]): List[Action] = {
    List(addChildAction(n), removeNodeAction(n)).flatten
  }

  def getCollections = Authenticated.async { req =>
    CollectionsStore.getAll map { collections =>
      val tree = Node.buildTree[Collection]("root",
        collections,
        (collection) => collection.path,
        (collection) => collection.pathId)

      val t = Json.toJson(tree)(asArgo)

      respond(Json.toJson(tree)(asArgo), actions = List(addChildAction()).flatten)
    }
  }

  // Basically default parameters, which Play doesn't support
  def addChildToRoot = addChildTo(None)
  def addChildToCollection(collectionPathId: String) = addChildTo(Some(collectionPathId))
  def addChildTo(collectionPathId: Option[String]) = Authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[String].map { child =>
      val path = child :: collectionPathId.map(CollectionsManager.stringToPath).getOrElse(Nil)
      val collection = Collection(path, ActionData(getUserFromReq(req), DateTime.now))
      CollectionsStore.add(collection).map { collection =>
        respond(Node(collection.path.last, Nil, collection.pathId, Some(collection)))
      }
    } getOrElse Future.successful(invalidJson(req.body))
  }

  def removeCollection(collectionPath: String) = Authenticated.async { req =>
    CollectionsStore.remove(collectionPath) map { collectionOpt =>
      collectionOpt.map(_ => Accepted).getOrElse(NotFound)
    }
  }

  // We have to do this as Play's serialisation doesn't work all that well.
  // Especially around types with subtypes, so we have to be very explicit here.
  implicit def collectionEntityWrites: Writes[Node[EmbeddedEntity[Collection]]] = (
    (__ \ "name").write[String] ~
    (__ \ "children").lazyWrite(Writes.seq[Node[EmbeddedEntity[Collection]]](collectionEntityWrites)) ~
    (__ \ "content").writeNullable[EmbeddedEntity[Collection]]
  )(node => (node.name, node.children, node.content))

  type CollectionsEntity = Seq[EmbeddedEntity[Node[Collection]]]
  implicit def asArgo: Writes[Node[Collection]] = (
    (__ \ "name").write[String] ~
      (__ \ "children").lazyWrite[CollectionsEntity](Writes[CollectionsEntity]
          // This is so we don't have to rewrite the Write[Seq[T]]
          (seq => Json.toJson(seq))).contramap(collectionsEntity) ~
      (__ \ "content").writeNullable[Collection]
    )(node => (node.name, node.children, node.content))


  def collectionsEntity(nodes: List[Node[Collection]]): CollectionsEntity = {
    nodes.map(n => EmbeddedEntity(collectionUri(n.pathId), Some(n), actions = getActions(n)))
  }

}



