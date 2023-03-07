package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.auth.{Syndication, Tier}
import com.gu.mediaservice.lib.config.RuntimeUsageRightsConfig
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.requests.searches.queries.Query
import lib.usagerights.CostCalculator
import lib.{ImagePersistenceReasons, MediaApiConfig, PersistenceReason}
import scalaz.NonEmptyList
import scalaz.syntax.std.list._

object PersistedQueries extends ImageFields {
  val photographerCategories = NonEmptyList(
    StaffPhotographer.category,
    ContractPhotographer.category,
    CommissionedPhotographer.category
  )

  val illustratorCategories = NonEmptyList(
    ContractIllustrator.category,
    StaffIllustrator.category,
    CommissionedIllustrator.category
  )

  val agencyCommissionedCategories = NonEmptyList(
    CommissionedAgency.category
  )

  val hasCrops = filters.bool.must(filters.existsOrMissing("exports", exists = true))
  val usedInContent = filters.nested("usages", filters.exists(NonEmptyList("usages")))
  def existedPreGrid(persistenceIdentifier: String) = filters.exists(NonEmptyList(identifierField(persistenceIdentifier)))
  val addedToLibrary = filters.bool.must(filters.boolTerm(editsField("archived"), value = true))
  val hasUserEditsToImageMetadata = filters.exists(NonEmptyList(editsField("metadata")))
  val hasPhotographerUsageRights = filters.bool.must(filters.terms(usageRightsField("category"), photographerCategories))
  val hasIllustratorUsageRights = filters.bool.must(filters.terms(usageRightsField("category"), illustratorCategories))
  val hasAgencyCommissionedUsageRights = filters.bool.must(filters.terms(usageRightsField("category"), agencyCommissionedCategories))
  def addedGNMArchiveOrPersistedCollections(persistedRootCollections: List[String]) = filters.bool.must(filters.terms(collectionsField("path"), persistedRootCollections.toNel.get))
  val addedToPhotoshoot = filters.exists(NonEmptyList(editsField("photoshoot")))
  val hasLabels = filters.exists(NonEmptyList(editsField("labels")))
  val hasLeases = filters.exists(NonEmptyList(leasesField("leases")))

}

class SearchFilters(config: MediaApiConfig) extends ImageFields {

  private val syndicationFilter = new SyndicationFilter(config)
  private val usageRights = config.applicableUsageRights.toList

//  private val freeSuppliers = config.usageRightsConfig.freeSuppliers
//  private val suppliersCollectionExcl = config.usageRightsConfig.suppliersCollectionExcl

  // Warning: The current media-api definition of invalid includes other requirements
  // so does not match this filter exactly!
  // TODO colocate to try and keep in sync?
  val validFilter: Option[Query] = config.requiredMetadata.map(metadataField).toNel.map(filters.exists)
  val invalidFilter: Option[Query] = config.requiredMetadata.map(metadataField).toNel.map(filters.anyMissing)





  val hasRightsCategoryFilter: Query = filters.existsOrMissing(usageRightsField("category"), exists = true)

  def freeFilter(cc: CostCalculator): Option[Query] = {
    val (suppliersWithExclusions, suppliersNoExclusions) = cc.freeSuppliers.toList.partition(
      cc.suppliersCollectionExcl.contains
    )
    val suppliersWithExclusionsFilters: List[Query] = for {
      supplier <- suppliersWithExclusions
      excludedCollections <- cc.suppliersCollectionExcl.get(supplier).flatMap(_.toList.toNel)
    } yield {
      filters.mustWithMustNot(
        filters.term(usageRightsField("supplier"), supplier),
        filters.terms(usageRightsField("suppliersCollection"), excludedCollections)
      )
    }
    val suppliersWithExclusionsFilter: Option[Query] = suppliersWithExclusionsFilters.toNel.map(filters.or)
    val suppliersNoExclusionsFilter: Option[Query] = suppliersNoExclusions.toNel.map(
      filters.terms(usageRightsField("supplier"), _)
    )
    val freeSupplierFilter: Option[Query] = filterOrFilter(
      suppliersWithExclusionsFilter, suppliersNoExclusionsFilter
    )

    // We're showing `Conditional` here too as we're considering them potentially
    // free. We could look into sending over the search query as a cost filter
    // that could take a comma separated list e.g. `cost=free,conditional`.
    val freeUsageRightsFilter: Option[Query] = freeToUseCategories.toNel.map(
      filters.terms(usageRightsField("category"), _)
    )
    filterOrFilter(freeSupplierFilter, freeUsageRightsFilter)
  }

  def nonFreeFilter(cc: CostCalculator): Option[Query] = freeFilter(cc).map(filters.not)

  def maybeFreeFilter(cc: CostCalculator): Option[Query] = filterOrFilter(freeFilter(cc), Some(filters.not(hasRightsCategoryFilter)))

  lazy val freeToUseCategories: List[String] =
    usageRights.filter(ur => ur.defaultCost.exists(cost => cost == Free || cost == Conditional)).map(ur => ur.category)

  val persistedReasons: List[PersistenceReason] = ImagePersistenceReasons(config.persistedRootCollections, config.persistenceIdentifier).allReasons

  val persistedFilter: Query = filters.or(persistedReasons.map(_.query): _*)

  val nonPersistedFilter: Query = filters.not(persistedFilter)

  def tierFilter(tier: Tier): Option[Query] = tier match {
    case Syndication => Some(syndicationFilter.statusFilter(QueuedForSyndication))
    case _ => None
  }

  def filterOrFilter(filter: Option[Query], orFilter: Option[Query]): Option[Query] = (filter, orFilter) match {
    case (Some(someFilter), Some(orSomeFilter)) => Some(filters.or(someFilter, orSomeFilter))
    case (filterOpt,    orFilterOpt)    => filterOpt orElse orFilterOpt
  }

  def filterAndFilter(filter: Option[Query], andFilter: Option[Query]): Option[Query] = (filter, andFilter) match {
    case (Some(someFilter), Some(andSomeFilter)) => Some(filters.and(someFilter, andSomeFilter))
    case (filterOpt,    andFilterOpt)    => filterOpt orElse andFilterOpt
  }

}
