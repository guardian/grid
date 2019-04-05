package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.SyndicationUsage
import com.sksamuel.elastic4s.searches.queries.Query
import org.joda.time.DateTime

class SyndicationFilter(syndicationStartDate: Option[DateTime]) extends ImageFields {
  private def syndicationRightsAcquired(acquired: Boolean): Query = filters.boolTerm(
    field = "syndicationRights.rights.acquired",
    value = acquired
  )

  private val noRightsAcquired: Query = filters.or(
    filters.existsOrMissing("syndicationRights.rights.acquired", exists = false),
    syndicationRightsAcquired(false)
  )

  private val hasRightsAcquired: Query = syndicationRightsAcquired(true)

  private val hasAllowLease: Query = filters.term(
    "leases.leases.access",
    AllowSyndicationLease.name
  )

  private val hasDenyLease: Query = filters.term(
    "leases.leases.access",
    DenySyndicationLease.name
  )

  private val hasSyndicationUsage: Query = filters.term(
    "usagesPlatform",
    SyndicationUsage.toString
  )

  private val leaseHasStarted: Query = filters.or(
    filters.existsOrMissing("leases.leases.startDate", exists = false),
    filters.date("leases.leases.startDate", None, Some(DateTime.now)).get
  )

  private val leaseHasEnded: Query = filters.or(
    filters.existsOrMissing("leases.leases.endDate", exists = false),
    filters.date("leases.leases.endDate", Some(DateTime.now), None).get
  )

  private val syndicationRightsPublished: Query = filters.or(
    filters.existsOrMissing("syndicationRights.published", exists = false),
    filters.date("syndicationRights.published", None, Some(DateTime.now)).get
  )

  private val syndicatableCategory: Query = filters.or(
    filters.term(usageRightsField("category"), StaffPhotographer.category),
    filters.term(usageRightsField("category"), CommissionedPhotographer.category),
    filters.term(usageRightsField("category"), ContractPhotographer.category)
  )

  def statusFilter(status: SyndicationStatus): Query = status match {
    case SentForSyndication => filters.and(
      hasRightsAcquired,
      hasAllowLease,
      hasSyndicationUsage
    )
    case QueuedForSyndication => filters.and(
      hasRightsAcquired,
      filters.mustNot(hasSyndicationUsage),
      filters.and(
        hasAllowLease,
        leaseHasStarted,
        syndicationRightsPublished
      )
    )
    case BlockedForSyndication => filters.and(
      hasRightsAcquired,
      hasDenyLease
    )
    case AwaitingReviewForSyndication => {
      val rightsAcquiredNoLeaseFilter = filters.and(
        hasRightsAcquired,
        syndicatableCategory,
        filters.mustNot(
          hasAllowLease,
          filters.and(
            hasDenyLease,
            leaseHasEnded
          )
        )
      )

      syndicationStartDate match {
        case Some(date) => filters.and(
          filters.date("uploadTime", Some(date), None).get,
          rightsAcquiredNoLeaseFilter
        )
        case _ => rightsAcquiredNoLeaseFilter
      }
    }
    case UnsuitableForSyndication => noRightsAcquired
  }

}
