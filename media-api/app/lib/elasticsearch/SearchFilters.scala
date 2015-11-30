package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.model._
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
  import UsageRightsConfig.{ suppliersCollectionExcl, freeSuppliers, payGettySourceList }

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

  // FIXME: There must be a better way (._.). Potentially making cost a lookup
  // again?
  lazy val freeToUseCategories: List[String] = List(
    CreativeCommons.category,
    CrownCopyright.category,
    GuardianWitness.category,
    Handout.category,
    Obituary.category,
    Pool.category,
    PrImage.category,
    Screengrab.category,
    SocialMedia.category,
    CommissionedAgency.category,
    StaffPhotographer.category,
    ContractPhotographer.category,
    CommissionedPhotographer.category,
    ContractIllustrator.category,
    CommissionedIllustrator.category,
    Composite.category
  )

  val persistedFilter = filters.or(
    filters.bool.must(filters.existsOrMissing("exports", true)),
    filters.exists(NonEmptyList(identifierField(Config.persistenceIdentifier))),
    filters.bool.must(filters.boolTerm(editsField("archived"), true)),
    filters.bool.must(filters.term(usageRightsField("category"), StaffPhotographer.category)),
    filters.bool.must(filters.term(usageRightsField("category"), ContractPhotographer.category)),
    filters.bool.must(filters.term(usageRightsField("category"), CommissionedPhotographer.category)),
    filters.bool.must(filters.term(usageRightsField("category"), ContractIllustrator.category)),
    filters.bool.must(filters.term(usageRightsField("category"), CommissionedIllustrator.category)),
    filters.bool.must(filters.term(usageRightsField("category"), CommissionedAgency.category))
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
