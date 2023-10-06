package lib

import com.gu.mediaservice.lib.elasticsearch.PersistedQueries
import com.gu.mediaservice.model.{CommissionedAgency, Illustrator, Image, ImageMetadata, Photographer}
import com.sksamuel.elastic4s.requests.searches.queries.Query


case class ImagePersistenceReasons(persistedRootCollections: List[String], persistenceIdentifier: String) {
  val allReasons: List[PersistenceReason] =
    List(
      HasPersistenceIdentifier(persistenceIdentifier),
      HasExports,
      HasUsages,
      IsArchived,
      IsPhotographerCategory,
      IsIllustratorCategory,
      IsAgencyCommissionedCategory,
      HasLeases,
      IsInPersistedCollection(persistedRootCollections),
      AddedToPhotoshoot,
      HasLabels,
      HasUserEdits
    )

  def reasons(image: Image): List[String] = allReasons.filter(_.shouldPersist(image)).map(_.reason)
}

sealed trait PersistenceReason {
  def shouldPersist(image: Image): Boolean
  val query: Query
  val reason: String
}

case class HasPersistenceIdentifier(persistenceIdentifier: String) extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.identifiers.contains(persistenceIdentifier)

  override val reason: String = "persistence-identifier"

  override val query: Query = PersistedQueries.existedPreGrid(persistenceIdentifier)
}

object HasExports extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.hasExports

  override val query: Query = PersistedQueries.hasCrops

  override val reason: String = "exports"
}

object HasUsages extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.hasUsages

  override val query: Query = PersistedQueries.usedInContent

  override val reason: String = "usages"
}

object IsArchived extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.userMetadata.exists(_.archived)

  override val query: Query = PersistedQueries.addedToLibrary
  override val reason: String = "archived"
}

object IsPhotographerCategory extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.usageRights match {
    case _: Photographer => true
    case _ => false
  }

  override val query: Query = PersistedQueries.hasPhotographerUsageRights
  override val reason: String = "photographer-category"
}

object IsIllustratorCategory extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.usageRights match {
    case _: Illustrator => true
    case _ => false
  }

  override val query: Query = PersistedQueries.hasIllustratorUsageRights
  override val reason: String = "illustrator-category"
}

object IsAgencyCommissionedCategory extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.usageRights match {
    case _: CommissionedAgency => true
    case _ => false
  }


  override val query: Query = PersistedQueries.hasAgencyCommissionedUsageRights
  override val reason: String = CommissionedAgency.category
}

object HasLeases extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.leases.leases.nonEmpty

  override val query: Query = PersistedQueries.hasLeases
  override val reason: String = "leases"
}

case class IsInPersistedCollection(persistedCollections: List[String]) extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = {
    // list of the first element of each collection's `path`, i.e all the root collections
    val collectionPaths: List[String] = image.collections.flatMap(_.path.headOption)

    // is image in at least one persisted collection?
    (collectionPaths diff persistedCollections).length < collectionPaths.length
  }

  override val query: Query = PersistedQueries.addedGNMArchiveOrPersistedCollections(persistedCollections)
  override val reason: String = "persisted-collection"
}

object AddedToPhotoshoot extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.userMetadata.exists(_.photoshoot.isDefined)

  override val query: Query = PersistedQueries.addedToPhotoshoot
  override val reason: String = "photoshoot"
}

object HasLabels extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.userMetadata.exists(_.labels.nonEmpty)

  override val query: Query = PersistedQueries.hasLabels
  override val reason: String = "labeled"
}

object HasUserEdits extends PersistenceReason {
  override def shouldPersist(image: Image): Boolean = image.userMetadata.exists(ed => ed.metadata != ImageMetadata.empty)

  override val query: Query = PersistedQueries.hasUserEditsToImageMetadata
  override val reason: String = "edited"
}
