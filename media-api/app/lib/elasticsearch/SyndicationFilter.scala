package lib.elasticsearch

import com.gu.mediaservice.lib.ImageFields
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{AllowSyndicationLease, DenySyndicationLease}
import com.gu.mediaservice.model.usage.SyndicationUsage
import com.sksamuel.elastic4s.ElasticApi.not
import com.sksamuel.elastic4s.requests.searches.RuntimeMapping
import com.sksamuel.elastic4s.requests.searches.queries.Query
import lib.MediaApiConfig
import org.joda.time.DateTime

class SyndicationFilter(config: MediaApiConfig) extends ImageFields {

  val isSyndicationDateFilterActive = config.isProd

  private val hasAllowLease: Query = filters.term(
    "leases.leases.access",
    AllowSyndicationLease.name
  )

  private val hasDenyLease: Query = filters.term(
    "leases.leases.access",
    DenySyndicationLease.name
  )

  val hasActiveDeny =
    filters.boolTerm("hasActiveDenySyndicationLease", value = true)

  val syndicationReviewQueueFixMapping = RuntimeMapping(
    field = hasActiveDeny.field,
    `type` = "boolean",
    scriptSource =
      """
         |long nowInMillis = new Date().getTime();
         |if (params['_source'].leases == null || params['_source'].leases.leases == null) {
         |    emit(false); return;
         |}
         |for (lease in params['_source'].leases.leases) {
         |    if (lease.access == 'deny-syndication' && (lease.endDate == null || ZonedDateTime.parse(lease.endDate).toInstant().toEpochMilli() > nowInMillis)) {
         |        emit(true); return;
         |    }
         |}
         |emit(false);
         |""".stripMargin
  )

  private val hasSyndicationUsage: Query = filters.term(
    "usagesPlatform",
    SyndicationUsage.toString
  )

  private def leaseHasStarted: Query = filters.or(
    filters.existsOrMissing("leases.leases.startDate", exists = false),
    filters.date("leases.leases.startDate", None, Some(DateTime.now)).get
  )

  private def leaseHasNotExpired: Query = filters.or(
    filters.existsOrMissing("leases.leases.endDate", exists = false),
    filters.date("leases.leases.endDate", Some(DateTime.now), None).get
  )

  private def syndicationRightsPublished: Query = filters.or(
    filters.existsOrMissing("syndicationRights.published", exists = false),
    filters.date("syndicationRights.published", None, Some(DateTime.now)).get
  )

  private val syndicatableCategory: Query = IsOwnedPhotograph().query

  def statusFilter(status: SyndicationStatus): Query = status match {
    case SentForSyndication => filters.and(
      hasAllowLease,
      hasSyndicationUsage
    )
    case QueuedForSyndication => filters.and(
      filters.mustNot(hasSyndicationUsage),
      filters.and(
        hasAllowLease,
        leaseHasStarted,
        syndicationRightsPublished
      )
    )
    case BlockedForSyndication => filters.and(
      hasDenyLease
    )
    case AwaitingReviewForSyndication => {

      val mustNotClauses = List(
        hasAllowLease,
        filters.and(
          hasDenyLease,
          leaseHasNotExpired
        ),
      ) ++ (
        if(config.useRuntimeFieldsToFixSyndicationReviewQueueQuery)
          List(hasActiveDeny) // this is last, to ensure runtime field is not computed unnecessarily
        else
          Nil
      )

      val rightsAcquiredNoLeaseFilter = filters.and(
        syndicatableCategory,
        filters.mustNot(mustNotClauses:_*),
      )

      config.syndicationStartDate match {
        case Some(date) if config.isProd => filters.and(
          filters.date("uploadTime", Some(date), None).get,
          rightsAcquiredNoLeaseFilter
        )
        case _ => rightsAcquiredNoLeaseFilter
      }
    }
    case UnsuitableForSyndication => not(IsOwnedPhotograph().query)
  }

}
