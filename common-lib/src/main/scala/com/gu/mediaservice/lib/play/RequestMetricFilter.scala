package com.gu.mediaservice.lib.play

import akka.stream.Materializer
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.metrics.CloudWatchMetrics
import play.api.mvc.{Filter, RequestHeader, Result}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success}

class RequestMetricFilter(val config: CommonConfig, override val mat: Materializer)(implicit ec: ExecutionContext) extends Filter {
  val namespace: String = s"${config.stage}/${config.appName.split('-').map(_.toLowerCase.capitalize).mkString("")}"
  val enabled: Boolean = config.requestMetricsEnabled

  object RequestMetrics extends CloudWatchMetrics(namespace, config) {
    val totalRequests = new CountMetric("TotalRequests")
    val successfulRequests = new CountMetric("SuccessfulRequests")
    val failedRequests = new CountMetric("FailedRequests")
    val requestDuration = new TimeMetric("RequestDuration")
  }

  override def apply(next: RequestHeader => Future[Result])(rh: RequestHeader): Future[Result] = {
    val start = System.currentTimeMillis()
    val result = next(rh)

    if (enabled && shouldRecord(rh)) {
      RequestMetrics.totalRequests.increment().run
      result onComplete {
        case Success(_) =>
          RequestMetrics.successfulRequests.increment().run
          val duration = System.currentTimeMillis() - start
          RequestMetrics.requestDuration.runRecordOne(duration)

        case Failure(_) =>
          RequestMetrics.failedRequests.increment().run
          val duration = System.currentTimeMillis() - start
          RequestMetrics.requestDuration.runRecordOne(duration)

      }
    }

    result
  }

  def shouldRecord(request: RequestHeader): Boolean = {
    request.path match {
      case "/management/healthcheck" => false
      case _ => true
    }
  }
}