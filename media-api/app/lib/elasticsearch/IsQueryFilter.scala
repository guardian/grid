package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.elasticsearch.{ReapableEligibility, filters}
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.ElasticDsl.matchAllQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query
import lib.MediaApiConfig
import org.joda.time.DateTime
import scalaz.syntax.std.list._

sealed trait IsQueryFilter extends Query with ImageFields {
  def query: Query

  override def toString: String = this match {
    case IsOwnedPhotograph() => s"owned-photo"
    case IsOwnedIllustration() => s"owned-illustration"
    case IsOwnedImage() => s"owned"
    case _: IsDeleted => "deleted"
    case _: IsUnderQuota => "under-quota"
    case _: IsReapable => "reapable"
  }
}

object IsQueryFilter {
  // for readability, the client capitalises gnm, so `toLowerCase` it before matching
  def apply(value: String, overQuotaAgencies: () => List[Agency], config: MediaApiConfig): Option[IsQueryFilter] = {
    value.toLowerCase match {
      case s if s == s"owned-photo" => Some(IsOwnedPhotograph())
      case s if s == s"owned-illustration" => Some(IsOwnedIllustration())
      case s if s == s"owned" => Some(IsOwnedImage())
      case "under-quota" => Some(IsUnderQuota(overQuotaAgencies()))
      case "deleted" => Some(IsDeleted(true))
      case "reapable" => Some(IsReapable(config.maybePersistOnlyTheseCollections))
      case _ => None
    }
  }
}

case class IsOwnedPhotograph() extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.photographer.map(_.category))
  )
}

case class IsOwnedIllustration() extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.illustrator.map(_.category))
  )
}

case class IsOwnedImage() extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.terms(usageRightsField("category"), UsageRights.whollyOwned.map(_.category))
  )
}

case class IsUnderQuota(overQuotaAgencies: List[Agency]) extends IsQueryFilter {
  override def query: Query = overQuotaAgencies.toNel
    .map(agency => filters.mustNot(filters.terms(usageRightsField("supplier"), agency.map(_.supplier))))
    .getOrElse(matchAllQuery())
}

case class IsDeleted(isDeleted: Boolean) extends IsQueryFilter {
  override def query: Query = filters.or(
    (filters.existsOrMissing("softDeletedMetadata", _))(isDeleted)
  )
}

case class IsReapable(maybePersistOnlyTheseCollections: Option[Set[String]])
  extends IsQueryFilter with ReapableEligibility {
  override def query: Query = preview
}
