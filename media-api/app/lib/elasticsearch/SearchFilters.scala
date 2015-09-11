package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import lib.usagerights.{DeprecatedConfig => UsageRightsDepConfig}
import com.gu.mediaservice.lib.config.UsageRightsConfig
import org.elasticsearch.index.query.FilterBuilder

import scalaz.syntax.std.list._
import scalaz.NonEmptyList

import lib.Config


trait SearchFilters extends ImageFields {

  val validFilter   = Config.requiredMetadata.map(metadataField).toNel.map(filters.exists)
  val invalidFilter = Config.requiredMetadata.map(metadataField).toNel.map(filters.anyMissing)

  // New Cost Model
  import UsageRightsConfig.{ suppliersCollectionExcl, freeSuppliers, payGettySourceList,
                             freeToUseCategories }
  import UsageRightsDepConfig.guardianCredits

  val (suppliersWithExclusions, suppliersNoExclusions) = freeSuppliers.partition(suppliersCollectionExcl.contains)
  val suppliersWithExclusionsFilters = for {
    supplier            <- suppliersWithExclusions
    excludedCollections <- suppliersCollectionExcl.get(supplier).flatMap(_.toNel)
  } yield {
    filters.bool.must(
      filters.term(usageRightsField("supplier"), supplier)
    ).mustNot(
      filters.terms(usageRightsField("suppliersCollection"), excludedCollections)
    )
  }
  val suppliersWithExclusionsFilter = suppliersWithExclusionsFilters.toList.toNel.map(filters.or)
  val suppliersNoExclusionsFilter = suppliersNoExclusions.toNel.map(filters.terms(usageRightsField("supplier"), _))
  val freeSupplierFilter = filterOrFilter(suppliersWithExclusionsFilter, suppliersNoExclusionsFilter)

  // We're showing `Conditional` here too as we're considering them potentially
  // free. We could look into sending over the search query as a cost filter
  // that could take a comma separated list e.g. `cost=free,conditional`.
  val freeUsageRightsFilter = freeToUseCategories.toNel.map(filters.terms(usageRightsField("category"), _))

  val freeFilter = filterOrFilter(freeSupplierFilter, freeUsageRightsFilter)
  val nonFreeFilter = freeFilter.map(filters.not)

  val guardianCreditFilter = guardianCredits.toNel.map(cs => filters.terms(metadataField("credit"), cs))
  val freeFilterOrGuardianCredits = filterOrFilter(freeFilter, guardianCreditFilter)
  val nonFreeFilterWithoutGuardianCredits = filterOrFilter(freeFilter, guardianCreditFilter)


  // Old cost model
  import UsageRightsDepConfig.{ freeCreditList, freeSourceList }

  // Warning: this requires the capitalisation to be exact; we may want to sanitise the credits
  // to a canonical representation in the future
  val creditFilter  = freeCreditList.toNel.map(cs => filters.terms(metadataField("credit"), cs))
  val sourceFilter  = freeSourceList.toNel.map(cs => filters.terms(metadataField("source"), cs))
  val freeWhitelist = filterOrFilter(creditFilter, sourceFilter)

  val sourceExclFilter = payGettySourceList.toNel.map(cs => filters.terms(metadataField("source"), cs))
  val freeCreditFilter = (freeWhitelist, sourceExclFilter) match {
    case (Some(whitelist), Some(sourceExcl)) => Some(filters.bool.must(whitelist).mustNot(sourceExcl))
    case (whitelistOpt,    sourceExclOpt)    => whitelistOpt orElse sourceExclOpt
  }

  // Merge legacy and new way of matching free images (matching either is enough)
  val freeMetadataFilter = filterOrFilter(freeCreditFilter, freeSupplierFilter)

  val depFreeFilter = filterOrFilter(freeMetadataFilter, freeUsageRightsFilter)
  val depNonFreeFilter = freeFilter.map(filters.not)

  // Filters used to compare old & new cost models
  val freeDiffFilter = filterAndFilter(freeFilter, depNonFreeFilter)
  val nonFreeDiffFilter = filterAndFilter(nonFreeFilter, depFreeFilter)

  // FIXME: There must be a better way (._.). Potentially making cost a lookup
  // again?
  lazy val freeToUseCategories: List[String] = List(
    "PR Image",
    "handout",
    "screengrab",
    "guardian-witness",
    "social-media",
    "obituary",
    "staff-photographer",
    "contract-photographer",
    "commissioned-photographer",
    "commissioned-agency",
    "pool"
  )

  val persistedFilter = filters.or(
    filters.bool.must(filters.existsOrMissing("exports", true)),
    filters.exists(NonEmptyList(identifierField(Config.persistenceIdentifier))),
    filters.bool.must(filters.boolTerm(editsField("archived"), true)),
    filters.bool.must(filters.term(usageRightsField("category"), "staff-photographer")),
    filters.bool.must(filters.term(usageRightsField("category"), "contract-photographer")),
    filters.bool.must(filters.term(usageRightsField("category"), "commissioned-photographer"))
  )

  val nonPersistedFilter = filters.not(persistedFilter)

  def filterOrFilter(filter: Option[FilterBuilder], orFilter: Option[FilterBuilder]): Option[FilterBuilder] = (filter, orFilter) match {
    case (Some(someFilter), Some(orSomeFilter)) => Some(filters.or(someFilter, orSomeFilter))
    case (filterOpt,    orFilterOpt)    => filterOpt orElse orFilterOpt
  }

  def filterAndFilter(filter: Option[FilterBuilder], andFilter: Option[FilterBuilder]): Option[FilterBuilder] = (filter, andFilter) match {
    case (Some(someFilter), Some(andSomeFilter)) => Some(filters.and(someFilter, andSomeFilter))
    case (filterOpt,    andFilterOpt)    => filterOpt orElse andFilterOpt
  }

}
