package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.auth.{Syndication, Tier}
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.requests.searches.queries.Query
import lib.{ImagePersistenceReasons, MediaApiConfig, PersistenceReason}
import scalaz.syntax.std.list._


class SearchFilters(config: MediaApiConfig) extends ImageFields {

  val syndicationFilter = new SyndicationFilter(config)
  val usageRights = config.applicableUsageRights.toList

  val freeSuppliers = config.usageRightsConfig.freeSuppliers
  val suppliersCollectionExcl = config.usageRightsConfig.suppliersCollectionExcl

  // Warning: The current media-api definition of invalid includes other requirements
  // so does not match this filter exactly!
  val validFilter: Query = filters.exists(config.requiredMetadata.map(metadataField))
  val invalidFilter: Query = filters.anyMissing(config.requiredMetadata.map(metadataField))

  val (suppliersWithExclusions, suppliersNoExclusions) = freeSuppliers.partition(suppliersCollectionExcl.contains)
  val suppliersWithExclusionsFilters: List[Query] = for {
    supplier            <- suppliersWithExclusions
    excludedCollections <- suppliersCollectionExcl.get(supplier).flatMap(_.toNel.toOption)
  } yield {
    filters.mustWithMustNot(
      filters.term(usageRightsField("supplier"), supplier),
      filters.terms(usageRightsField("suppliersCollection"), excludedCollections)
    )
  }

  val suppliersWithExclusionsFilter: Option[Query] = suppliersWithExclusionsFilters.toNel.map(filters.or).toOption
  val suppliersNoExclusionsFilter: Option[Query] = suppliersNoExclusions.toNel.map(filters.terms(usageRightsField("supplier"), _)).toOption
  val freeSupplierFilter: Option[Query] = filterOrFilter(suppliersWithExclusionsFilter, suppliersNoExclusionsFilter)

  // We're showing `Conditional` here too as we're considering them potentially
  // free. We could look into sending over the search query as a cost filter
  // that could take a comma separated list e.g. `cost=free,conditional`.
  val freeUsageRightsFilter: Option[Query] = freeToUseCategories.toNel.map(filters.terms(usageRightsField("category"), _)).toOption

  val hasRightsCategoryFilter: Query = filters.existsOrMissing(usageRightsField("category"), exists = true)

  val freeFilter: Option[Query] = filterOrFilter(freeSupplierFilter, freeUsageRightsFilter)
  val nonFreeFilter: Option[Query] = freeFilter.map(filters.not)

  val maybeFreeFilter: Option[Query] = filterOrFilter(freeFilter, Some(filters.not(hasRightsCategoryFilter)))

  lazy val freeToUseCategories: List[String] =
    usageRights.filter(ur => ur.defaultCost.exists(cost => cost == Free || cost == Conditional)).map(ur => ur.category)

  val persistedReasons: List[PersistenceReason] = ImagePersistenceReasons(config.maybePersistOnlyTheseCollections).allReasons

  val persistedFilter: Query = filters.or(persistedReasons.map(_.query): _*)

  val nonPersistedFilter: Query = filters.not(persistedFilter)

  def tierFilter(tier: Tier): Option[Query] = tier match {
    case Syndication => Some(syndicationFilter.statusFilter(QueuedForSyndication))
    case _ => None
  }

  def printUsageFilters(printFilters: PrintUsageFilters): Query = filters.nested("usages", filters.and(Seq(
    Some(filters.term("usages.status", "published")),
    Some(filters.term("usages.platform", "print")),
    Some(filters.date(
      "usages.printUsageMetadata.issueDate",
      from = printFilters.issueDate.minusSeconds(1), // minus 1 second to account for exclusive range
      to = printFilters.issueDate.plusDays(1)
    )),
    printFilters.sectionCode.map(filters.term("usages.printUsageMetadata.sectionCode", _)),
    printFilters.pageNumber.map(filters.term("usages.printUsageMetadata.pageNumber", _)),
    printFilters.edition.map(filters.term("usages.printUsageMetadata.edition", _)),
    printFilters.orderedBy.map(filters.term("usages.printUsageMetadata.orderedBy", _)),
  ).flatten:_*))

  def filterOrFilter(filter: Option[Query], orFilter: Option[Query]): Option[Query] = (filter, orFilter) match {
    case (Some(someFilter), Some(orSomeFilter)) => Some(filters.or(someFilter, orSomeFilter))
    case (filterOpt,    orFilterOpt)    => filterOpt orElse orFilterOpt
  }

  def filterAndFilter(filter: Option[Query], andFilter: Option[Query]): Option[Query] = (filter, andFilter) match {
    case (Some(someFilter), Some(andSomeFilter)) => Some(filters.and(someFilter, andSomeFilter))
    case (filterOpt,    andFilterOpt)    => filterOpt orElse andFilterOpt
  }

}
