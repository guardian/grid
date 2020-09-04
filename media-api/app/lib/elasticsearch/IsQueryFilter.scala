package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.ElasticDsl.matchAllQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query
import scalaz.syntax.std.list._

sealed trait IsQueryFilter extends Query with ImageFields {
  def query: Query

  override def toString: String = this match {
    case IsOwnedPhotograph => "gnm-owned-photo"
    case IsOwnedIllustration => "gnm-owned-illustration"
    case IsOwnedImage => "gnm-owned"
    case _: IsUnderQuota => "under-quota"
  }
}

object IsQueryFilter {
  // for readability, the client capitalises gnm, so `toLowerCase` it before matching
  def apply(value: String, overQuotaAgencies: () => List[Agency]): Option[IsQueryFilter] = value.toLowerCase match {
    case "gnm-owned-photo" => Some(IsOwnedPhotograph)
    case "gnm-owned-illustration" => Some(IsOwnedIllustration)
    case "gnm-owned" => Some(IsOwnedImage)
    case "under-quota" => Some(IsUnderQuota(overQuotaAgencies()))
    case _ => None
  }
}

object IsOwnedPhotograph extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.photographer.toNel.get.map(_.category))
  )
}

object IsOwnedIllustration extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.illustrator.toNel.get.map(_.category))
  )
}

object IsOwnedImage extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.whollyOwned.toNel.get.map(_.category))
  )
}

case class IsUnderQuota(overQuotaAgencies: List[Agency]) extends IsQueryFilter {
  override def query: Query = overQuotaAgencies.toNel
    .map(agency => filters.mustNot(filters.terms(usageRightsField("supplier"), agency.map(_.supplier))))
    .getOrElse(matchAllQuery)
}
