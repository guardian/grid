package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.SyndicationUsage
import com.sksamuel.elastic4s.searches.queries.Query
import lib.MediaApiConfig
import lib.elasticsearch.impls.elasticsearch1.SyndicationFilter._
import org.joda.time.DateTime

class SyndicationFilter(config: MediaApiConfig) {

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
    "usages.platform",
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

  private val syndicationStartDateFilter: Query = {
    // syndication starts on 23 August 2018 as that's when training had been completed
    // don't show images uploaded prior to this date to keep the review queue manageable
    // for Editorial by not showing past images that RCS has told us about (~5k images)
    // TODO move this to config?
    val startDate = new DateTime()
      .withYear(2018)
      .withMonthOfYear(8)
      .withDayOfMonth(23)
      .withTimeAtStartOfDay()

    filters.date("uploadTime", Some(startDate), None).get
  }

  private val illustratorFilter: Query = filters.or(
    filters.term(usageRightsField("category"), ContractIllustrator.category),
    filters.term(usageRightsField("category"), StaffIllustrator.category),
    filters.term(usageRightsField("category"), CommissionedIllustrator.category)
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
        filters.mustNot(
          illustratorFilter,
          hasAllowLease,
          filters.and(
            hasDenyLease,
            leaseHasEnded
          )
        )
      )

      if (isSyndicationDateFilterActive) {
        filters.and(
          syndicationStartDateFilter,
          rightsAcquiredNoLeaseFilter
        )
      } else {
        rightsAcquiredNoLeaseFilter
      }
    }
    case UnsuitableForSyndication => noRightsAcquired
  }

}
