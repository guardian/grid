package lib.elasticsearch.impls.elasticsearch1

import com.gu.mediaservice.lib.elasticsearch.ImageFields
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.usage.SyndicationUsage
import lib.MediaApiConfig
import org.elasticsearch.index.query.FilterBuilder
import org.joda.time.DateTime
import scalaz.NonEmptyList

object SyndicationFilter extends ImageFields {
  private def syndicationRightsAcquired(acquired: Boolean): FilterBuilder = filters.boolTerm(
    field = "syndicationRights.rights.acquired",
    value = acquired
  )

  private val noRightsAcquired: FilterBuilder = filters.or(
    filters.missing(NonEmptyList("syndicationRights.rights.acquired")),
    syndicationRightsAcquired(false)
  )

  private val hasRightsAcquired: FilterBuilder = filters.bool.must(
    syndicationRightsAcquired(true)
  )

  private val hasAllowLease: FilterBuilder = filters.term(
    "leases.leases.access",
    AllowSyndicationLease.name
  )

  private val hasDenyLease: FilterBuilder = filters.term(
    "leases.leases.access",
    DenySyndicationLease.name
  )

  private val hasSyndicationUsage: FilterBuilder = filters.term(
    "usages.platform",
    SyndicationUsage.toString
  )

  private val isActive: FilterBuilder = {
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

  private val syndicationRightsPublished: FilterBuilder = filters.or(
    filters.missing(NonEmptyList("syndicationRights.published")),
    filters.dateBefore("syndicationRights.published", DateTime.now)
  )

  private val syndicationStartDateFilter: FilterBuilder = {
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

  private val syndicatableCategory: FilterBuilder = filters.or(
    filters.term(usageRightsField("category"), StaffPhotographer.category),
    filters.term(usageRightsField("category"), CommissionedPhotographer.category)
  )

  def statusFilter(status: SyndicationStatus, config: MediaApiConfig): FilterBuilder = status match {
    case SentForSyndication => filters.and(
      hasRightsAcquired,
      hasAllowLease,
      hasSyndicationUsage
    )
    case QueuedForSyndication => filters.and(
      hasRightsAcquired,
      syndicationRightsPublished,
      filters.bool.mustNot(hasSyndicationUsage),
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
        filters.bool.mustNot(
          hasAllowLease,
          filters.and(
            hasDenyLease,
            isActive
          )
        )
      )

      if (config.isProd) {
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
