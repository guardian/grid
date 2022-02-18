package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model._
import com.gu.mediaservice.syntax.WhenNonEmptySyntax
import com.sksamuel.elastic4s.ElasticDsl.matchAllQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query

sealed trait IsQueryFilter extends Query with ImageFields {
  def query: Query

  override def toString: String = this match {
    case IsOwnedPhotograph(staffPhotographerOrg) => s"$staffPhotographerOrg-owned-photo"
    case IsOwnedIllustration(staffPhotographerOrg) => s"$staffPhotographerOrg-owned-illustration"
    case IsOwnedImage(staffPhotographerOrg) => s"$staffPhotographerOrg-owned"
    case _: IsDeleted => "deleted"
    case _: IsUnderQuota => "under-quota"
  }
}

object IsQueryFilter {
  // for readability, the client capitalises gnm, so `toLowerCase` it before matching
  def apply(value: String, overQuotaAgencies: () => List[Agency], staffPhotographerOrganisation: String): Option[IsQueryFilter] = {
   val organisation = staffPhotographerOrganisation.toLowerCase
    value.toLowerCase match {
      case s if s == s"$organisation-owned-photo" => Some(IsOwnedPhotograph(organisation))
      case s if s == s"$organisation-owned-illustration" => Some(IsOwnedIllustration(organisation))
      case s if s == s"$organisation-owned" => Some(IsOwnedImage(organisation))
      case "under-quota" => Some(IsUnderQuota(overQuotaAgencies()))
      case "deleted" => Some(IsDeleted())
      case _ => None
    }
  }
}

case class IsOwnedPhotograph(staffPhotographerOrg: String) extends IsQueryFilter {
  override def query: Query =
    filters.terms(usageRightsField("category"), UsageRights.photographer.map(_.category))
}

case class IsOwnedIllustration(staffPhotographerOrg: String) extends IsQueryFilter {
  override def query: Query =
    filters.terms(usageRightsField("category"), UsageRights.illustrator.map(_.category))
}

case class IsOwnedImage(staffPhotographerOrg: String) extends IsQueryFilter {
  override def query: Query = filters.terms(usageRightsField("category"), UsageRights.whollyOwned.map(_.category))
}

case class IsUnderQuota(overQuotaAgencies: List[Agency]) extends IsQueryFilter with WhenNonEmptySyntax {
  override def query: Query = overQuotaAgencies.whenNonEmpty
    .map(agency => filters.mustNot(filters.terms(usageRightsField("supplier"), agency.map(_.supplier))))
    .getOrElse(matchAllQuery)
}

case class IsDeleted() extends IsQueryFilter {
  override def query: Query = filters.existsOrMissing("softDeletedMetadata", exists = true)
}
