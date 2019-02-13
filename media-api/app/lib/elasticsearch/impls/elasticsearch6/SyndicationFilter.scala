package lib.elasticsearch.impls.elasticsearch6

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.SyndicationUsage
import com.sksamuel.elastic4s.searches.queries.Query
import lib.MediaApiConfig
import lib.elasticsearch.impls.elasticsearch1.SyndicationFilter._
import org.joda.time.DateTime
import scalaz.NonEmptyList

class SyndicationFilter(config: MediaApiConfig) {

  val isSyndicationDateFilterActive: Boolean = config.isProd

  private def syndicationRightsAcquired(acquired: Boolean): Query = filters.boolTerm(
    field = "syndicationRights.rights.acquired",
    value = acquired
  )

  private val noRightsAcquired: Query = filters.or(
    filters.missing(NonEmptyList("syndicationRights.rights.acquired")),
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

  private val isActive: Query = {
    val started = filters.or(
      filters.missing(NonEmptyList("leases.leases.startDate")),
      filters.dateAfter("leases.leases.startDate", DateTime.now)
    )

    val notEnded = filters.or(
      filters.missing(NonEmptyList("leases.leases.endDate")),
      filters.dateAfter("leases.leases.endDate", DateTime.now)
    )

    filters.and(started, notEnded)
  }

  private val syndicationRightsPublished: Query = filters.or(
    filters.missing(NonEmptyList("syndicationRights.published")),
    filters.dateBefore("syndicationRights.published", DateTime.now)
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

    filters.dateAfter("uploadTime", startDate)
  }

  private val syndicatableCategory: Query = filters.or(
    filters.term(usageRightsField("category"), StaffPhotographer.category),
    filters.term(usageRightsField("category"), CommissionedPhotographer.category)
  )

  def statusFilter(status: SyndicationStatus): Query = status match {
    case SentForSyndication => filters.and(
      hasRightsAcquired,
      hasAllowLease,
      hasSyndicationUsage
    )
    case QueuedForSyndication => filters.and(
      hasRightsAcquired,
      syndicationRightsPublished,
      filters.mustNot(hasSyndicationUsage),
      hasAllowLease,
      isActive
    )
    case BlockedForSyndication => filters.and(
      hasRightsAcquired,
      hasDenyLease,
      isActive
    )
    case AwaitingReviewForSyndication => {
      val rightsAcquiredNoLeaseFilter = filters.and(
        hasRightsAcquired,
        syndicatableCategory,
        filters.mustNot(
          hasAllowLease,
          filters.and(
            hasDenyLease,
            isActive
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
