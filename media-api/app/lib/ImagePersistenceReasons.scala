package lib

import com.gu.mediaservice.model.{CommissionedAgency, Illustrator, Image, ImageMetadata, Photographer, UsageRights}

import scala.collection.mutable.ListBuffer

object ImagePersistenceReasons {
  def apply(persistedRootCollections: List[String], persistenceIdentifier: String): ImagePersistenceReasons =
    new ImagePersistenceReasons(persistedRootCollections, persistenceIdentifier)
}

class ImagePersistenceReasons(persistedRootCollections: List[String], persistenceIdentifier: String) {

  def getImagePersistenceReasons(image: Image) = {
    val reasons = ListBuffer[String]()

    if (hasPersistenceIdentifier(image, persistenceIdentifier))
      reasons += "persistence-identifier"

    if (image.hasExports)
      reasons += "exports"

    if (image.hasUsages)
      reasons += "usages"

    if (isArchived(image))
      reasons += "archived"

    if (isPhotographerCategory(image.usageRights))
      reasons += "photographer-category"

    if (isIllustratorCategory(image.usageRights))
      reasons += "illustrator-category"

    if (isAgencyCommissionedCategory(image.usageRights))
      reasons += CommissionedAgency.category

    if (hasLeases(image))
      reasons += "leases"

    if (isInPersistedCollection(image, persistedRootCollections))
      reasons += "persisted-collection"

    if (hasPhotoshoot(image))
      reasons += "photoshoot"

    if (hasLabels(image))
      reasons += "labeled"

    if (hasUserEdits(image))
      reasons += "edited"

    reasons.toList
  }

  private def isInPersistedCollection(image: Image, persistedRootCollections: List[String]): Boolean = {
    // list of the first element of each collection's `path`, i.e all the root collections
    val collectionPaths: List[String] = image.collections.flatMap(_.path.headOption)

    // is image in at least one persisted collection?
    (collectionPaths diff persistedRootCollections).length < collectionPaths.length
  }

  private def hasLabels(image: Image) = image.userMetadata.exists(_.labels.nonEmpty)

  private def hasUserEdits(image: Image) =
    image.userMetadata.exists(ed => ed.metadata != ImageMetadata.empty)

  private def isIllustratorCategory[T <: UsageRights](usageRights: T) =
    usageRights match {
      case _: Illustrator => true
      case _ => false
    }

  private def isAgencyCommissionedCategory[T <: UsageRights](usageRights: T) =
    usageRights match {
      case _: CommissionedAgency => true
      case _ => false
    }

  private def isPhotographerCategory[T <: UsageRights](usageRights: T) =
    usageRights match {
      case _: Photographer => true
      case _ => false
    }

  private def hasPhotoshoot(image: Image): Boolean = image.userMetadata.exists(_.photoshoot.isDefined)

  private def hasPersistenceIdentifier(image: Image, persistenceIdentifier: String) = {
    image.identifiers.contains(persistenceIdentifier)
  }

  private def isArchived(image: Image) =
    image.userMetadata.exists(_.archived)

  private def hasLeases(image: Image) =
    image.leases.leases.nonEmpty

}
