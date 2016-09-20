package lib

import scala.util.Try

import scala.concurrent.duration._
import scala.concurrent.{Future, Await}

import akka.actor.Scheduler
import akka.agent.Agent

import org.joda.time.DateTime

import _root_.play.api.libs.concurrent.Execution.Implicits._

import com.gu.mediaservice.model.{Image, Agencies, UsageRights, Agency}
import com.gu.mediaservice.lib.FeatureToggle
import com.gu.mediaservice.lib.usage._

import lib.elasticsearch.ElasticSearch


case class ImageNotFound() extends Exception("Image not found")
case class BadQuotaConfig() extends Exception("Bad config for usage quotas")
case class NoUsageQuota() extends Exception("No usage found for this image")

trait UsageQuota {
  val supplierConfig: Map[String, Int]
  val store: Agent[Map[String, UsageStatus]] = Agent(Map())
  val lastUpdated: Agent[DateTime] = Agent(DateTime.now())

  lazy val supplierQuota = supplierConfig.map {
    case (k,v) => k -> SupplierUsageQuota(Agencies.get(k), v)}

  val numberOfDayInPeriod = 30

  def getStoreAccess(): Future[StoreAccess] = for {
      s <- store.future
      l <- lastUpdated.future
    } yield StoreAccess(s,l)

  def scheduleUpdates(scheduler: Scheduler) {
    scheduler.schedule(0.seconds, 10.minutes)(update())
  }

  def isOverQuota(
    rights: UsageRights,
    waitMillis: Int = 100
  ) = Try {Await.result(
    usageStatusForUsageRights(rights),
    waitMillis.millis)
  }.toOption
    .map(_.exceeded)
    .getOrElse(false) && FeatureToggle.get("usage-quota-ui")

  def getUsageStatusForUsageRights(usageRights: UsageRights) = {
    val storeFuture = store.future

    val imageSupplierFuture = Future { usageRights match {
      case a: Agency => a
      case _ => throw new Exception("Image is not supplied by Agency")
    }}

    for {
      store <- storeFuture
      imageSupplier <- imageSupplierFuture
      usageReport = store.get(imageSupplier.supplier)

      if !usageReport.isEmpty
    } yield usageReport

  }

  def usageStatusForUsageRights(usageRights: UsageRights): Future[UsageStatus] = {
    val usageStatusOptionFuture = getUsageStatusForUsageRights(usageRights)

    for {
      usageStatusOption <- usageStatusOptionFuture

      usageStatusFuture = Future { usageStatusOption.get }
        .recover { case e: NoSuchElementException => throw new NoUsageQuota }

      usageStatus <- usageStatusFuture
        .recover { case _ => throw new BadQuotaConfig }

    } yield usageStatus
  }

  def update() = {
    val usageSummaries: Future[List[SupplierUsageSummary]] = Future.sequence(
      Agencies.all.keys.map(ElasticSearch.usageForSupplier(_, numberOfDayInPeriod)))
        .map(_.toList)

    val usageQuotas: Future[Map[String, UsageStatus]] = usageSummaries.map(summaries => {
      summaries
        .groupBy(_.agency.supplier)
        .mapValues(_.head)
        .mapValues((summary: SupplierUsageSummary) => {
          val quota = summary.agency.id.flatMap(id => supplierQuota.get(id))
          val exceeded = quota.map(q => summary.count > q.count).getOrElse(false)
          val fractionOfQuota: Float = quota.map(q => summary.count.toFloat / q.count).getOrElse(0F)

          UsageStatus(
            exceeded,
            fractionOfQuota,
            summary,
            quota
          )
        })
    })

    usageQuotas.map(usage => {
      store.send(usage)
      lastUpdated.send(DateTime.now())
    })
  }

  def usageStatusForImage(id: String): Future[UsageStatus] = for {
      imageJsonOption <- ElasticSearch.getImageById(id)

      imageOption = imageJsonOption
        .flatMap(imageJson => Try { imageJson.as[Image] }.toOption)

      image <- Future { imageOption.get }
        .recover { case _ => throw new ImageNotFound }

      usageStatus <- usageStatusForUsageRights(image.usageRights)

    } yield usageStatus

}
