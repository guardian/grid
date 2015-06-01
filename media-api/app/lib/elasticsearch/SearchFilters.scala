package lib.elasticsearch

import scalaz.syntax.std.list._

import lib.Config
import com.gu.mediaservice.model.{Pay, Free, Conditional}


trait SearchFilters extends ImageFields {

  val validFilter   = Config.requiredMetadata.map(metadataField).toNel.map(filters.exists)
  val invalidFilter = Config.requiredMetadata.map(metadataField).toNel.map(filters.anyMissing)

  // NOTE: cost matching using credit/source soon to be deprecated

  // Warning: this requires the capitalisation to be exact; we may want to sanitise the credits
  // to a canonical representation in the future
  val creditFilter  = Config.freeCreditList.toNel.map(cs => filters.terms(metadataField("credit"), cs))
  val sourceFilter  = Config.freeSourceList.toNel.map(cs => filters.terms(metadataField("source"), cs))
  val freeWhitelist = (creditFilter, sourceFilter) match {
    case (Some(credit), Some(source)) => Some(filters.or(credit, source))
    case (creditOpt,    sourceOpt)    => creditOpt orElse sourceOpt
  }
  val sourceExclFilter = Config.payGettySourceList.toNel.map(cs => filters.not(filters.terms(metadataField("source"), cs)))
  val freeCreditFilter = (freeWhitelist, sourceExclFilter) match {
    case (Some(whitelist), Some(sourceExcl)) => Some(filters.and(whitelist, sourceExcl))
    case (whitelistOpt,    sourceExclOpt)    => whitelistOpt orElse sourceExclOpt
  }


  // NOTE: cost matching using supplier/suppliersCollection soon to take over credit/source

  import Config.{freeSuppliers, suppliersCollectionExcl}

  val (suppliersWithExclusions, suppliersNoExclusions) = freeSuppliers.partition(suppliersCollectionExcl.contains)
  val suppliersWithExclusionsFilters = for {
    supplier            <- suppliersWithExclusions
    excludedCollections <- suppliersCollectionExcl.get(supplier).flatMap(_.toNel)
  } yield {
      filters.and(
        filters.term(usageRightsField("supplier"), supplier),
        filters.not(filters.terms(usageRightsField("suppliersCollection"), excludedCollections))
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
  // that could take a comma seperated list e.g. `cost=free,conditional`.
  val freeUsageRightsOverrideFilter = List(Free, Conditional).map(_.toString).toNel.map(filters.terms(editsField(usageRightsField("cost")), _))
  val freeUsageRightsCategoryFilter = Config.freeUsageRightsCategories.map(_.toString).toNel.map(filters.terms(usageRightsField("category"), _))

  val freeUsageRightsFilter = (freeUsageRightsOverrideFilter, freeUsageRightsCategoryFilter) match {
    case (Some(freeUsageRightsOverride), Some(freeUsageRightsCategory)) => Some(filters.or(freeUsageRightsOverride, freeUsageRightsCategory))
    case (freeUsageRightsOverrideOpt,    freeUsageRightsCategoryOpt)    => freeUsageRightsOverrideOpt orElse freeUsageRightsCategoryOpt
  }

  val freeFilter = (freeMetadataFilter, freeUsageRightsFilter) match {
    case (Some(freeMetadata), Some(freeUsageRights)) => Some(filters.or(freeMetadata, freeUsageRights))
    case (freeMetadataOpt,    freeUsageRightsOpt)    => freeMetadataOpt orElse freeUsageRightsOpt
  }


  // lastly we make sure there isn't an override on the cost
  val notPayUsageRightsFilter  =
    List(Pay)
      .map(_.toString).toNel
      .map(filters.terms(editsField(usageRightsField("cost")), _))
      .map(filters.not)

  val freeFilterWithOverride = (freeFilter, notPayUsageRightsFilter) match {
    case (Some(free), Some(notPayUsageRights)) => Some(filters.and(free, notPayUsageRights))
    case (freeOpt,    notPayUsageRightsOpt)    => freeOpt orElse notPayUsageRightsOpt
  }
  val nonFreeFilter = freeFilterWithOverride.map(filters.not)

}
