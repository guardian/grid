package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{AllowSyndicationLease, DenySyndicationLease}
import com.gu.mediaservice.model.usage.SyndicationUsage
import com.sksamuel.elastic4s.requests.searches.queries.Query
import lib.MediaApiConfig
import org.joda.time.DateTime

class SyndicationFilter(config: MediaApiConfig) extends ImageFields {

  val isSyndicationDateFilterActive = config.isProd

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

  private val syndicatableCategory: Query = IsOwnedPhotograph(config.staffPhotographerOrganisation).query

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

      config.syndicationStartDate match {
        case Some(date) if config.isProd => filters.and(
          filters.date("uploadTime", Some(date), None).get,
          rightsAcquiredNoLeaseFilter
        )
        case _ => rightsAcquiredNoLeaseFilter
      }
    }
    case UnsuitableForSyndication => noRightsAcquired
  }

}
