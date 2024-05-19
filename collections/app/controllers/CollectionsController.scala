package controllers

import java.net.URI
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.{EmbeddedEntity, Link}
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.auth.Authentication.getIdentity
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.lib.config.InstanceForRequest
import com.gu.mediaservice.model.{ActionData, Collection, Instance}
import lib.CollectionsConfig
import model.Node
import org.joda.time.DateTime
import play.api.libs.functional.syntax._
import play.api.libs.json._
import play.api.mvc.{BaseController, ControllerComponents, Request}
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
                            val controllerComponents: ControllerComponents) extends BaseController with ArgoHelpers with InstanceForRequest {

  import CollectionsManager.{getCssColour, isValidPathBit, pathToUri, uriToPath}
  // Stupid name clash between Argo and Play
  import com.gu.mediaservice.lib.argo.model.{Action => ArgoAction}

  private def uri(u: String) = URI.create(u)
  private def collectionUri()(implicit instance: Instance) = uri(s"${config.rootUri(instance)}/collections")
  private def collectionUri(p: List[String] = Nil)(implicit instance: Instance) = {
    val path = if(p.nonEmpty) s"/${pathToUri(p)}" else ""
    uri(s"${config.rootUri(instance)}/collections$path")
  }

  private val appIndex = AppIndex("media-collections", "The one stop shop for collections")
  private def indexLinks()(implicit instance: Instance) = List(Link("collections", collectionUri().toString))

  private def getNodeAction(n: Node[Collection])(implicit instance: Instance): Option[Link] = Some(Link("collection", collectionUri(n.fullPath).toString))
  private def addChildAction(pathId: List[String] = Nil)(implicit instance: Instance): Option[ArgoAction] = Some(ArgoAction("add-child", collectionUri(pathId), "POST"))
  private def addChildAction(n: Node[Collection])(implicit instance: Instance): Option[ArgoAction] = addChildAction(n.fullPath)
  private def removeNodeAction(n: Node[Collection])(implicit instance: Instance): Option[ArgoAction] = if (n.children.nonEmpty) None else Some(
    ArgoAction("remove", collectionUri(n.fullPath), "DELETE")
  )

  def index = authenticated { req =>
    respond(appIndex, links = indexLinks()(instanceOf(req)))
  }

  def collectionNotFound(path: String) =
    respondError(NotFound, "collection-not-found", s"Could not find collection: $path")

  def invalidJson(json: JsValue) =
    respondError(BadRequest, "invalid-json", s"Could not parse json: ${json.toString}")

  def invalidTreeOperationError(message: String) =
    respondError(BadRequest, "invalid-tree-operation", message)

  def storeError(message: String) =
    respondError(InternalServerError, "collection-store-error", message)

  def getActions(n: Node[Collection])(implicit instance: Instance): List[ArgoAction] = {
    List(addChildAction(n), removeNodeAction(n)).flatten
  }

  private def getLinks(n: Node[Collection])(implicit instance: Instance): List[Link] = {
    List(getNodeAction(n)).flatten
  }

  def correctedCollections = authenticated.async { req =>
    implicit val instance: Instance = instanceOf(req)
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

  def getCollection(collectionPathId: String) = authenticated.async { request =>
    implicit val instance: Instance = instanceOf(request)
    store.get(uriToPath(collectionPathId)).map {
      case Some(collection) =>
        val node = Node(collection.path.last, Nil, collection.path, collection.path, Some(collection))
        respond(node, actions = getActions(node))
      case None =>
        respondNotFound("Collection not found")
    } recover {
      case e: CollectionsStoreError => storeError(e.message)
    }
  }

  def getCollections = authenticated.async { req =>
    implicit val instance: Instance = instanceOf(req)
    implicit def asArgo: Writes[Node[Collection]] = (
      (__ \ "basename").write[String] ~
        (__ \ "children").lazyWrite[CollectionsEntity](Writes[CollectionsEntity]
          // This is so we don't have to rewrite the Write[Seq[T]]
          (seq => Json.toJson(seq))).contramap(collectionsEntity(_: List[Node[Collection]])) ~
        (__ \ "fullPath").write[List[String]] ~
        (__ \ "data").writeNullable[Collection] ~
        (__ \ "cssColour").writeNullable[String]
      )(node => (node.basename, node.children, node.fullPath, node.data, getCssColour(node.fullPath)))

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
    implicit val instance: Instance = instanceOf(req)
    (req.body \ "data").asOpt[String] map { child =>
      if (isValidPathBit(child)) {
        val path = collectionPathId.map(uriToPath).getOrElse(Nil) :+ child
        val collection = Collection.build(path, ActionData(getIdentity(req.user), DateTime.now))

        store.add(collection).map { collection =>
          val node = Node(collection.path.last, Nil, collection.path, collection.path, Some(collection))
          logger.info(apiKeyMarkers(req.user.accessor), s"Adding collection ${path.mkString("/")}")
          respond(node, links = getLinks(node), actions = getActions(node))
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
    implicit val instance: Instance = instanceOf(req)
    val path = CollectionsManager.uriToPath(UriOps.encodePlus(collectionPath))

    hasChildren(path).flatMap { noRemove =>
      if(noRemove) {
        throw HasChildrenError(
          s"$collectionPath has children, can't delete!"
        )
      } else {
        logger.info(apiKeyMarkers(req.user.accessor), s"Deleting collection ${path.mkString("/")}")
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

  private def collectionsEntity(nodes: List[Node[Collection]])(implicit instance: Instance): CollectionsEntity = {
    nodes.map(n => EmbeddedEntity(collectionUri(n.fullPath), Some(n), links = getLinks(n), actions = getActions(n)))
  }

}



