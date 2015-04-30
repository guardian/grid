package lib.elasticsearch

import scalaz.syntax.std.list._

import lib.Config
import com.gu.mediaservice.model.{Pay, Free, Conditional}


trait SearchFilters extends ImageFields {

  val validFilter      = Config.requiredMetadata.map(metadataField).toNel.map(filters.exists)
  val invalidFilter    = Config.requiredMetadata.map(metadataField).toNel.map(filters.anyMissing)

  // Warning: this requires the capitalisation to be exact; we may want to sanitise the credits
  // to a canonical representation in the future
  val creditFilter        = Config.freeCreditList.toNel.map(cs => filters.terms("metadata.credit", cs))
  val sourceFilter        = Config.freeSourceList.toNel.map(cs => filters.terms("metadata.source", cs))
  val freeWhitelist       = (creditFilter, sourceFilter) match {
    case (Some(credit), Some(source)) => Some(filters.or(credit, source))
    case (creditOpt,    sourceOpt)    => creditOpt orElse sourceOpt
  }
  val sourceExclFilter    = Config.payGettySourceList.toNel.map(cs => filters.not(filters.terms("metadata.source", cs)))
  val freeCopyrightFilter = (freeWhitelist, sourceExclFilter) match {
    case (Some(whitelist), Some(sourceExcl)) => Some(filters.and(whitelist, sourceExcl))
    case (whitelistOpt,    sourceExclOpt)    => whitelistOpt orElse sourceExclOpt
  }

  // We're showing `Conditional` here too as we're considering them potentially
  // free. We could look into sending over the search query as a cost filter
  // that could take a comma seperated list e.g. `cost=free,conditional`.
  val freeUsageRightsFilter = List(Free, Conditional).map(_.toString).toNel.map(filters.terms(editsField("usageRights.cost"), _))
  val freeFilter = (freeCopyrightFilter, freeUsageRightsFilter) match {
    case (Some(freeCopyright), Some(freeUsageRights)) => Some(filters.or(freeCopyright, freeUsageRights))
    case (freeCopyrightOpt,    freeUsageRightsOpt)    => freeCopyrightOpt orElse freeUsageRightsOpt
  }

  // lastly we make sure there isn't an override on the cost
  val notPayUsageRightsFilter  =
    List(Pay)
      .map(_.toString).toNel
      .map(filters.terms(editsField("usageRights.cost"), _))
      .map(filters.not)

  val freeFilterWithOverride = (freeFilter, notPayUsageRightsFilter) match {
    case (Some(free), Some(notPayUsageRights)) => Some(filters.and(free, notPayUsageRights))
    case (freeOpt,    notPayUsageRightsOpt)    => freeOpt orElse notPayUsageRightsOpt
  }
  val nonFreeFilter       = freeFilterWithOverride.map(filters.not)

}
