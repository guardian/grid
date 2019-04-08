package lib.elasticsearch.impls.elasticsearch1

import com.gu.mediaservice.lib.auth.{Syndication, Tier}
import com.gu.mediaservice.lib.config.UsageRightsConfig
import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.model._
import org.elasticsearch.index.query.FilterBuilder
import scalaz.NonEmptyList
import scalaz.syntax.std.list._


class SearchFilters(requiredMetadata: List[String], persistenceIdentifier: String, persistedRootCollections: Option[List[String]],
                    syndicationFilter: SyndicationFilter) extends ImageFields {

  import UsageRightsConfig.{freeSuppliers, suppliersCollectionExcl}

  // Warning: The current media-api definition of invalid includes other requirements
  // so does not match this filter exactly!
  val validFilter: Option[FilterBuilder] = requiredMetadata.map(metadataField).toNel.map(filters.exists)
  val invalidFilter: Option[FilterBuilder] = requiredMetadata.map(metadataField).toNel.map(filters.anyMissing)

  val (suppliersWithExclusions, suppliersNoExclusions) = freeSuppliers.partition(suppliersCollectionExcl.contains)
  val suppliersWithExclusionsFilters: List[FilterBuilder] = for {
    supplier <- suppliersWithExclusions
    excludedCollections <- suppliersCollectionExcl.get(supplier).flatMap(_.toNel)
  } yield {
    filters.mustWithMustNot(
      filters.term(usageRightsField("supplier"), supplier),
      filters.terms(usageRightsField("suppliersCollection"), excludedCollections)
    )
  }

  val suppliersWithExclusionsFilter: Option[FilterBuilder] = suppliersWithExclusionsFilters.toNel.map(filters.or)
  val suppliersNoExclusionsFilter: Option[FilterBuilder] = suppliersNoExclusions.toNel.map(filters.terms(usageRightsField("supplier"), _))
  val freeSupplierFilter: Option[FilterBuilder] = filterOrFilter(suppliersWithExclusionsFilter, suppliersNoExclusionsFilter)

  // We're showing `Conditional` here too as we're considering them potentially
  // free. We could look into sending over the search query as a cost filter
  // that could take a comma separated list e.g. `cost=free,conditional`.
  val freeUsageRightsFilter: Option[FilterBuilder] = freeToUseCategories.toNel.map(filters.terms(usageRightsField("category"), _))

  val hasRightsCategoryFilter: FilterBuilder = filters.existsOrMissing(usageRightsField("category"), exists = true)

  val freeFilter: Option[FilterBuilder] = filterOrFilter(freeSupplierFilter, freeUsageRightsFilter)
  val nonFreeFilter: Option[FilterBuilder] = freeFilter.map(filters.not)

  val maybeFreeFilter: Option[FilterBuilder] = filterOrFilter(freeFilter, Some(filters.not(hasRightsCategoryFilter)))

  lazy val freeToUseCategories: List[String] =
    UsageRights.all.filter(ur => ur.defaultCost.exists(cost => cost == Free || cost == Conditional)).map(ur => ur.category)

  val persistedCategories = NonEmptyList(
    StaffPhotographer.category,
    ContractPhotographer.category,
    CommissionedPhotographer.category,
    ContractIllustrator.category,
    StaffIllustrator.category,
    CommissionedIllustrator.category,
    CommissionedAgency.category
  )

  val hasCrops = filters.bool.must(filters.existsOrMissing("exports", exists = true))
  val usedInContent = filters.bool.must(filters.existsOrMissing("usages", exists = true))
  val existedPreGrid = filters.exists(NonEmptyList(identifierField(persistenceIdentifier)))
  val addedToLibrary = filters.bool.must(filters.boolTerm(editsField("archived"), value = true))
  val hasUserEditsToImageMetadata = filters.exists(NonEmptyList(editsField("metadata")))
  val hasPersistedUsageRights = filters.bool.must(filters.terms(usageRightsField("category"), persistedCategories))
  val addedToPhotoshoot = filters.exists(NonEmptyList(editsField("photoshoot")))
  val hasLabels = filters.exists(NonEmptyList(editsField("labels")))

  val basePersistedFilters: Seq[FilterBuilder] = Seq(
    hasCrops,
    usedInContent,
    existedPreGrid,
    addedToLibrary,
    hasUserEditsToImageMetadata,
    hasPersistedUsageRights,
    addedToPhotoshoot,
    hasLabels
  )

  val persistedFilter: FilterBuilder = persistedRootCollections match {
    case Some(persistedCollections) =>
      val addedGNMArchiveOrPersistedCollections = filters.bool.must(filters.terms(collectionsField("path"), persistedCollections.toNel.get))
      filters.or(basePersistedFilters :+ addedGNMArchiveOrPersistedCollections:_ *)

    case None =>
      filters.or(basePersistedFilters:_ *)
  }

  val nonPersistedFilter: FilterBuilder = filters.not(persistedFilter)

  def tierFilter(tier: Tier): Option[FilterBuilder] = tier match {
    case Syndication => Some(syndicationFilter.statusFilter(QueuedForSyndication))
    case _ => None
  }

  def filterOrFilter(filter: Option[FilterBuilder], orFilter: Option[FilterBuilder]): Option[FilterBuilder] = (filter, orFilter) match {
    case (Some(someFilter), Some(orSomeFilter)) => Some(filters.or(someFilter, orSomeFilter))
    case (filterOpt, orFilterOpt) => filterOpt orElse orFilterOpt
  }

  def filterAndFilter(filter: Option[FilterBuilder], andFilter: Option[FilterBuilder]): Option[FilterBuilder] = (filter, andFilter) match {
    case (Some(someFilter), Some(andSomeFilter)) => Some(filters.and(someFilter, andSomeFilter))
    case (filterOpt, andFilterOpt) => filterOpt orElse andFilterOpt
  }

}
