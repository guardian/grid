package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.ElasticDsl.matchAllQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query
import scalaz.syntax.std.list._

sealed trait IsQueryFilter extends Query with ImageFields {
  def query: Query

  override def toString: String = this match {
    case IsOwnedPhotograph(staffPhotographerOrg) => s"$staffPhotographerOrg-owned-photo"
    case IsOwnedIllustration(staffPhotographerOrg) => s"$staffPhotographerOrg-owned-illustration"
    case IsOwnedImage(staffPhotographerOrg) => s"$staffPhotographerOrg-owned"
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
      case _ => None
    }
  }
}

case class IsOwnedPhotograph(staffPhotographerOrg: String) extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.photographer.toNel.get.map(_.category))
  )
}

case class IsOwnedIllustration(staffPhotographerOrg: String) extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.illustrator.toNel.get.map(_.category))
  )
}

case class IsOwnedImage(staffPhotographerOrg: String) extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.whollyOwned.toNel.get.map(_.category))
  )
}

case class IsUnderQuota(overQuotaAgencies: List[Agency]) extends IsQueryFilter {
  override def query: Query = overQuotaAgencies.toNel
    .map(agency => filters.mustNot(filters.terms(usageRightsField("supplier"), agency.map(_.supplier))))
    .getOrElse(matchAllQuery)
}
