package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.searches.queries.Query

sealed trait IsQueryFilter extends Query with ImageFields {
  def query: Query

  override def toString: String = this match {
    case IsGnmOwnedPhotographer => "gnm-owned-photo"
    case IsGnmOwnedIllustration => "gnm-owned-illustration"
    case IsGnmOwned => "gnm-owned"
  }
}

object IsQueryFilter {
  // for readability, the client capitalises gnm, so `toLowerCase` it before matching
  def apply(value: String): Option[IsQueryFilter] = value.toLowerCase match {
    case "gnm-owned-photo" => Some(IsGnmOwnedPhotographer)
    case "gnm-owned-illustration" => Some(IsGnmOwnedIllustration)
    case "gnm-owned" => Some(IsGnmOwned)
    case _ => None
  }
}

object IsGnmOwnedPhotographer extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.term(usageRightsField("category"), StaffPhotographer.category),
    filters.term(usageRightsField("category"), CommissionedPhotographer.category),
    filters.term(usageRightsField("category"), ContractPhotographer.category)
  )
}

object IsGnmOwnedIllustration extends IsQueryFilter {
  override def query: Query = filters.or(
    filters.term(usageRightsField("category"), StaffIllustrator.category),
    filters.term(usageRightsField("category"), CommissionedIllustrator.category),
    filters.term(usageRightsField("category"), ContractIllustrator.category)
  )
}

object IsGnmOwned extends IsQueryFilter {
  override def query: Query = filters.or(
    IsGnmOwnedPhotographer.query,
    IsGnmOwnedIllustration.query
  )
}
