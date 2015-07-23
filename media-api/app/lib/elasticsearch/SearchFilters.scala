package lib.elasticsearch

import lib.usagerights.{DeprecatedConfig => UsageRightsDepConfig}
import com.gu.mediaservice.lib.config.UsageRightsConfig

import scalaz.syntax.std.list._

import lib.Config


trait SearchFilters extends ImageFields {

  val validFilter   = Config.requiredMetadata.map(metadataField).toNel.map(filters.exists)
  val invalidFilter = Config.requiredMetadata.map(metadataField).toNel.map(filters.anyMissing)

  // NOTE: cost matching using credit/source soon to be deprecated

  import UsageRightsConfig.{ suppliersCollectionExcl, freeSuppliers, payGettySourceList }
  import UsageRightsDepConfig.{ freeCreditList, freeSourceList }

  // Warning: this requires the capitalisation to be exact; we may want to sanitise the credits
  // to a canonical representation in the future
  val creditFilter  = freeCreditList.toNel.map(cs => filters.terms(metadataField("credit"), cs))
  val sourceFilter  = freeSourceList.toNel.map(cs => filters.terms(metadataField("source"), cs))
  val freeWhitelist = (creditFilter, sourceFilter) match {
    case (Some(credit), Some(source)) => Some(filters.or(credit, source))
    case (creditOpt,    sourceOpt)    => creditOpt orElse sourceOpt
  }
  val sourceExclFilter = payGettySourceList.toNel.map(cs => filters.terms(metadataField("source"), cs))
  val freeCreditFilter = (freeWhitelist, sourceExclFilter) match {
    case (Some(whitelist), Some(sourceExcl)) => Some(filters.bool.must(whitelist).mustNot(sourceExcl))
    case (whitelistOpt,    sourceExclOpt)    => whitelistOpt orElse sourceExclOpt
  }


  // NOTE: cost matching using supplier/suppliersCollection soon to take over credit/source

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
  val freeSupplierFilter = (suppliersWithExclusionsFilter, suppliersNoExclusionsFilter) match {
    case (Some(withExclusions), Some(noExclusions)) => Some(filters.or(withExclusions, noExclusions))
    case (withExclusionsOpt,    noExclusionsOpt)    => withExclusionsOpt orElse noExclusionsOpt
  }


  // Merge legacy and new way of matching free images (matching either is enough)
  val freeMetadataFilter = (freeCreditFilter, freeSupplierFilter) match {
    case (Some(freeCredit), Some(freeSupplier)) => Some(filters.or(freeCredit, freeSupplier))
    case (freeCreditOpt,    freeSupplierOpt)    => freeCreditOpt orElse freeSupplierOpt
  }


  // We're showing `Conditional` here too as we're considering them potentially
  // free. We could look into sending over the search query as a cost filter
  // that could take a comma separated list e.g. `cost=free,conditional`.
  val freeUsageRightsFilter = freeToUseCategories.toNel.map(filters.terms(usageRightsField("category"), _))

  val freeFilter = (freeMetadataFilter, freeUsageRightsFilter) match {
    case (Some(freeMetadata), Some(freeUsageRights)) => Some(filters.or(freeMetadata, freeUsageRights))
    case (freeMetadataOpt,    freeUsageRightsOpt)    => freeMetadataOpt orElse freeUsageRightsOpt
  }


  val nonFreeFilter = freeFilter.map(filters.not)

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
    "pool"
  )

}
