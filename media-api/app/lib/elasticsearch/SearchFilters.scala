package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.auth.{Syndication, Tier}
import com.gu.mediaservice.model._
import com.gu.mediaservice.syntax.WhenNonEmptySyntax
import com.sksamuel.elastic4s.requests.searches.queries.{NestedQuery, Query}
import com.sksamuel.elastic4s.requests.searches.queries.compound.BoolQuery
import lib.{ImagePersistenceReasons, MediaApiConfig, PersistenceReason}

object PersistedQueries extends ImageFields {
  val photographerCategories: List[String] = List(
    StaffPhotographer.category,
    ContractPhotographer.category,
    CommissionedPhotographer.category
  )

  val illustratorCategories: List[String] = List(
    ContractIllustrator.category,
    StaffIllustrator.category,
    CommissionedIllustrator.category
  )

  val agencyCommissionedCategories: List[String] = List(
    CommissionedAgency.category
  )

  val hasCrops: BoolQuery = filters.bool().must(filters.existsOrMissing("exports", exists = true))
  val usedInContent: NestedQuery = filters.nested("usages", filters.exists(List("usages")))
  def existedPreGrid(persistenceIdentifier: String): Query = filters.exists(List(identifierField(persistenceIdentifier)))
  val addedToLibrary: BoolQuery = filters.bool().must(filters.boolTerm(editsField("archived"), value = true))
  val hasUserEditsToImageMetadata: Query = filters.exists(List(editsField("metadata")))
  val hasPhotographerUsageRights: BoolQuery = filters.bool().must(filters.terms(usageRightsField("category"), photographerCategories))
  val hasIllustratorUsageRights: BoolQuery = filters.bool().must(filters.terms(usageRightsField("category"), illustratorCategories))
  val hasAgencyCommissionedUsageRights: BoolQuery = filters.bool().must(filters.terms(usageRightsField("category"), agencyCommissionedCategories))
  def addedGNMArchiveOrPersistedCollections(persistedRootCollections: List[String]): BoolQuery = filters.bool().must(filters.terms(collectionsField("path"), persistedRootCollections))
  val addedToPhotoshoot: Query = filters.exists(List(editsField("photoshoot")))
  val hasLabels: Query = filters.exists(List(editsField("labels")))
  val hasLeases: Query = filters.exists(List(leasesField("leases")))

}

class SearchFilters(config: MediaApiConfig) extends ImageFields with WhenNonEmptySyntax {

  val syndicationFilter = new SyndicationFilter(config)
  val usageRights: List[UsageRightsSpec] = config.applicableUsageRights.toList

  val freeSuppliers: List[String] = config.usageRightsConfig.freeSuppliers
  val suppliersCollectionExcl: Map[String, List[String]] = config.usageRightsConfig.suppliersCollectionExcl

  // Warning: The current media-api definition of invalid includes other requirements
  // so does not match this filter exactly!
  val requiredMetadataFields: Option[List[String]] =
    if (config.requiredMetadata.nonEmpty)
      Some(config.requiredMetadata.map(metadataField))
    else
      None
  val validFilter: Option[Query] = requiredMetadataFields.map(filters.exists)
  val invalidFilter: Option[Query] = requiredMetadataFields.map(filters.anyMissing)

  val (suppliersWithExclusions, suppliersNoExclusions) = freeSuppliers.partition(suppliersCollectionExcl.contains)
  val suppliersWithExclusionsFilters: List[Query] = for {
    supplier            <- suppliersWithExclusions
    excludedCollections <- suppliersCollectionExcl.get(supplier).flatMap(_.whenNonEmpty)
  } yield {
    filters.mustWithMustNot(
      filters.term(usageRightsField("supplier"), supplier),
      filters.terms(usageRightsField("suppliersCollection"), excludedCollections)
    )
  }

  val suppliersWithExclusionsFilter: Option[Query] = suppliersWithExclusionsFilters.whenNonEmpty.map(filters.or(_))
  val suppliersNoExclusionsFilter: Option[Query] = suppliersNoExclusions.whenNonEmpty.map(filters.terms(usageRightsField("supplier"), _))
  val freeSupplierFilter: Option[Query] = filterOrFilter(suppliersWithExclusionsFilter, suppliersNoExclusionsFilter)

  // We're showing `Conditional` here too as we're considering them potentially
  // free. We could look into sending over the search query as a cost filter
  // that could take a comma separated list e.g. `cost=free,conditional`.
  val freeUsageRightsFilter: Option[Query] = freeToUseCategories.whenNonEmpty.map(filters.terms(usageRightsField("category"), _))

  val hasRightsCategoryFilter: Query = filters.existsOrMissing(usageRightsField("category"), exists = true)

  val freeFilter: Option[Query] = filterOrFilter(freeSupplierFilter, freeUsageRightsFilter)
  val nonFreeFilter: Option[Query] = freeFilter.map(filters.not)

  val maybeFreeFilter: Option[Query] = filterOrFilter(freeFilter, Some(filters.not(hasRightsCategoryFilter)))

  lazy val freeToUseCategories: List[String] =
    usageRights.filter(ur => ur.defaultCost.exists(cost => cost == Free || cost == Conditional)).map(ur => ur.category)

  val persistedReasons: List[PersistenceReason] = ImagePersistenceReasons(config.persistedRootCollections, config.persistenceIdentifier).allReasons

  val persistedFilter: Query = filters.or(persistedReasons.map(_.query))

  val nonPersistedFilter: Query = filters.not(persistedFilter)

  def tierFilter(tier: Tier): Option[Query] = tier match {
    case Syndication => Some(syndicationFilter.statusFilter(QueuedForSyndication))
    case _ => None
  }

  def filterOrFilter(filter: Option[Query], orFilter: Option[Query]): Option[Query] = (filter, orFilter) match {
    case (Some(someFilter), Some(orSomeFilter)) => Some(filters.or(someFilter, orSomeFilter))
    case (filterOpt, orFilterOpt) => filterOpt orElse orFilterOpt
  }

  def filterAndFilter(filter: Option[Query], andFilter: Option[Query]): Option[Query] = (filter, andFilter) match {
    case (Some(someFilter), Some(andSomeFilter)) => Some(filters.and(someFilter, andSomeFilter))
    case (filterOpt, andFilterOpt) => filterOpt orElse andFilterOpt
  }

}
