package controllers

import java.net.URI

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.{EmbeddedEntity, Link}
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.getEmail
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.{ActionData, Collection}
import lib.CollectionsConfig
import model.Node
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._
import play.api.mvc.{BaseController, ControllerComponents}
import store.{CollectionsStore, CollectionsStoreError}
import com.gu.mediaservice.lib.net.{URI => UriOps}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future


case class HasChildrenError(message: String) extends Throwable
case class InvalidPrinciple(message: String) extends Throwable
case class AppIndex(name: String, description: String, config: Map[String, String] = Map())

object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

class CollectionsController(authenticated: Authentication, config: CollectionsConfig, store: CollectionsStore,
                            val controllerComponents: ControllerComponents) extends BaseController with ArgoHelpers {

  import CollectionsManager.{getCssColour, isValidPathBit, pathToUri, uriToPath}
  // Stupid name clash between Argo and Play
  import com.gu.mediaservice.lib.argo.model.{Action => ArgoAction}

  def uri(u: String) = URI.create(u)
  val collectionUri = uri(s"${config.rootUri}/collections")
  def collectionUri(p: List[String] = Nil) = {
    val path = if(p.nonEmpty) s"/${pathToUri(p)}" else ""
    uri(s"${config.rootUri}/collections$path")
  }

  val appIndex = AppIndex("media-collections", "The one stop shop for collections")
  val indexLinks = List(Link("collections", collectionUri.toString))

  def addChildAction(pathId: List[String] = Nil): Option[ArgoAction] = Some(ArgoAction("add-child", collectionUri(pathId), "POST"))
  def addChildAction(n: Node[Collection]): Option[ArgoAction] = addChildAction(n.fullPath)
  def removeNodeAction(n: Node[Collection]): Option[ArgoAction] = if (n.children.nonEmpty) None else Some(
    ArgoAction("remove", collectionUri(n.fullPath), "DELETE")
  )

  def index = authenticated { req =>
    respond(appIndex, links = indexLinks)
  }

  def collectionNotFound(path: String) =
    respondError(NotFound, "collection-not-found", s"Could not find collection: $path")

  def invalidJson(json: JsValue) =
    respondError(BadRequest, "invalid-json", s"Could not parse json: ${json.toString}")

  def invalidTreeOperationError(message: String) =
    respondError(BadRequest, "invalid-tree-operation", message)

  def storeError(message: String) =
    respondError(InternalServerError, "collection-store-error", message)

  def getActions(n: Node[Collection]): List[ArgoAction] = {
    List(addChildAction(n), removeNodeAction(n)).flatten
  }

  def correctedCollections = authenticated.async { req =>
    store.getAll flatMap { collections =>
      val tree = Node.fromList[Collection](
        collections,
        (collection) => collection.path,
        (collection) => collection.description)

      val correctTree = tree hackmap { node =>
        val correctedCollection = node.data.map(c => c.copy(path = node.correctPath))
        Node(node.basename, node.children, node.fullPath, node.correctPath, correctedCollection)
      }

      val futures = correctTree.toList(Nil) map { correctedCollection =>
        store.add(correctedCollection)
      }

      Future.sequence(futures) map { updatedCollectionsList =>
        respond(updatedCollectionsList)
      }
    }
  }

  def allCollections = store.getAll.map { collections =>
    Node.fromList[Collection](
      collections,
      (collection) => collection.path,
      (collection) => collection.description)
  }

  def getCollections = authenticated.async { req =>
    allCollections.map { tree =>
      respond(
        Json.toJson(tree)(asArgo),
        actions = List(addChildAction()).flatten
      )
    } recover {
      case e: CollectionsStoreError => storeError(e.message)
    }
  }

  // Basically default parameters, which Play doesn't support
  def addChildToRoot = addChildTo(None)
  def addChildToCollection(collectionPathId: String) = addChildTo(Some(collectionPathId))
  def addChildTo(collectionPathId: Option[String]) = authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[String] map { child =>
      if (isValidPathBit(child)) {
        val path = collectionPathId.map(uriToPath).getOrElse(Nil) :+ child
        val collection = Collection.build(path, ActionData(getEmail(req.user), DateTime.now))

        store.add(collection).map { collection =>
          val node = Node(collection.path.last, Nil, collection.path, collection.path, Some(collection))
          respond(node, actions = getActions(node))
        } recover {
          case e: CollectionsStoreError => storeError(e.message)
        }
      } else {
        Future.successful(respondError(BadRequest, "invalid-input", "You cannot have slashes or double quotes in your path name"))
      }
    } getOrElse Future.successful(invalidJson(req.body))
  }

  type MaybeTree = Option[Node[Collection]]
  def hasChildren(path: List[String]): Future[Boolean] =
    allCollections.map { tree =>

      // Traverse the tree using the path
      val maybeTree = path
        .foldLeft[MaybeTree](Some(tree))((optBranch, nodeName) => {

          optBranch.flatMap { _.children.find(_.basename == nodeName) }
        })

      // Does out target node have children?
      maybeTree.flatMap(_.children.headOption).isDefined
    }

  def removeCollection(collectionPath: String) = authenticated.async { req =>
    val path = CollectionsManager.uriToPath(UriOps.encodePlus(collectionPath))

    hasChildren(path).flatMap { noRemove =>
      if(noRemove) {
        throw HasChildrenError(
          s"$collectionPath has children, can't delete!"
        )
      } else {
        store.remove(path).map(_ => Accepted)
      }
    } recover {
      case e: CollectionsStoreError => storeError(e.message)
      case e: HasChildrenError => invalidTreeOperationError(e.message)
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
      (__ \ "data").writeNullable[Collection] ~
      (__ \ "cssColour").writeNullable[String]
    )(node => (node.basename, node.children, node.fullPath, node.data, getCssColour(node.fullPath)))


  def collectionsEntity(nodes: List[Node[Collection]]): CollectionsEntity = {
    nodes.map(n => EmbeddedEntity(collectionUri(n.fullPath), Some(n), actions = getActions(n)))
  }

}



