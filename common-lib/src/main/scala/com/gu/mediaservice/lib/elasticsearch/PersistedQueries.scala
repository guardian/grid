package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model._
import com.sksamuel.elastic4s.ElasticApi.matchNoneQuery
import scalaz.NonEmptyList

object PersistedQueries extends ImageFields {
  val photographerCategories = NonEmptyList(
    StaffPhotographer.category,
    ContractPhotographer.category,
    CommissionedPhotographer.category
  )

  val illustratorCategories = NonEmptyList(
    ContractIllustrator.category,
    StaffIllustrator.category,
    CommissionedIllustrator.category
  )

  val agencyCommissionedCategories = NonEmptyList(
    CommissionedAgency.category
  )

  val hasCrops = filters.bool().must(filters.existsOrMissing("exports", exists = true))
  val usedInContent = filters.nested("usages", filters.exists(NonEmptyList("usages")))

  val addedToLibrary = filters.bool().must(filters.boolTerm(editsField("archived"), value = true))
  val hasUserEditsToImageMetadata = filters.exists(NonEmptyList(editsField("metadata")))
  val hasPhotographerUsageRights = filters.bool().must(filters.terms(usageRightsField("category"), photographerCategories))
  val hasIllustratorUsageRights = filters.bool().must(filters.terms(usageRightsField("category"), illustratorCategories))
  val hasAgencyCommissionedUsageRights = filters.bool().must(filters.terms(usageRightsField("category"), agencyCommissionedCategories))

  def isInPersistedCollection(maybePersistOnlyTheseCollections: Option[Set[String]]) =
    maybePersistOnlyTheseCollections.map(_.toList) match {
      case None =>
        filters.exists(NonEmptyList("collections"))
      case Some(Nil) => matchNoneQuery()
      case Some(head :: tail) =>
        filters.bool().must(filters.terms(collectionsField("path"), NonEmptyList.fromSeq(head, tail)))
    }


  val addedToPhotoshoot = filters.exists(NonEmptyList(editsField("photoshoot")))
  val hasLabels = filters.exists(NonEmptyList(editsField("labels")))
  val hasLeases = filters.exists(NonEmptyList(leasesField("leases")))

}
