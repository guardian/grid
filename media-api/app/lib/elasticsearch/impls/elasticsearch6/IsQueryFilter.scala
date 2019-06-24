package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model.{CommissionedPhotographer, ContractPhotographer, StaffPhotographer}
import com.sksamuel.elastic4s.searches.queries.Query

sealed trait IsQueryFilter extends Query with ImageFields {
  def query: Query

  override def toString: String = this match {
    case IsGnmOwnedPhotographer => "gnm-owned"
  }
}

object IsQueryFilter {
  // for readability, the client capitalises gnm, so `toLowerCase` it before matching
  def apply(value: String): Option[IsQueryFilter] = value.toLowerCase match {
    case "gnm-owned" => Some(IsGnmOwnedPhotographer)
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
