package com.gu.mediaservice.lib.metrics

import akka.actor.{Actor, ActorSystem, Props, Timers}
import com.amazonaws.services.cloudwatch.{AmazonCloudWatch, AmazonCloudWatchClientBuilder}
import com.amazonaws.services.cloudwatch.model.{Dimension, MetricDatum, PutMetricDataRequest, StandardUnit, StatisticSet}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.GridLogging

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.{DurationInt, FiniteDuration}

trait Metric[A] {
  def recordOne(value: A, dimensions: List[Dimension] = Nil): Unit

  def recordMany(values: Seq[A], dimensions: List[Dimension] = Nil): Unit
}

abstract class CloudWatchMetrics(
  namespace: String,
  config: CommonConfig,
  actorSystem: ActorSystem
)(implicit ec: ExecutionContext) extends GridLogging {

  class CountMetric(name: String) extends CloudWatchMetric[Long](name) {
    protected def toDatum(value: Long, dimensions: List[Dimension]) = datum(StandardUnit.Count, value, dimensions)

    def increment(dimensions: List[Dimension] = Nil, n: Long = 1): Unit = recordOne(n, dimensions)
  }

  class TimeMetric(name: String) extends CloudWatchMetric[Long](name) {
    protected def toDatum(value: Long, dimensions: List[Dimension]) = datum(StandardUnit.Milliseconds, value, dimensions)
  }

  private val client: AmazonCloudWatch = config.withAWSCredentials(AmazonCloudWatchClientBuilder.standard()).build()

  private[CloudWatchMetrics] val metricsActor = actorSystem.actorOf(MetricsActor.props(namespace, client), "metricsactor")

  abstract class CloudWatchMetric[A](val name: String) extends Metric[A] {
    final def recordOne(value: A, dimensions: List[Dimension] = Nil): Unit =
      metricsActor ! MetricsActor.AddMetrics(List(toDatum(value, dimensions)))

    final def recordMany(values: Seq[A], dimensions: List[Dimension] = Nil): Unit = {
      metricsActor ! MetricsActor.AddMetrics(values.map(value => toDatum(value, dimensions)))
    }

    /** Must be implemented to provide a way to turn an `A` into a `MetricDatum` */
    protected def toDatum(a: A, dimensions: List[Dimension]): MetricDatum

    /** Convenience method for instantiating a `MetricDatum` with this metric's `name` and `dimension` */
    protected def datum(unit: StandardUnit, value: Double, dimensions: List[Dimension]): MetricDatum =
      new MetricDatum()
        .withMetricName(name)
        .withUnit(unit)
        .withValue(value)
        .withDimensions(dimensions.asJava)
        .withTimestamp(new java.util.Date())
  }
}

object MetricsActor {
  def props(namespace: String, client: AmazonCloudWatch): Props =
    Props(new MetricsActor(namespace, client))

  final case object Tick
  final case class AddMetrics(values: Seq[MetricDatum])
}
class MetricsActor(namespace: String, client: AmazonCloudWatch) extends Actor with Timers with GridLogging {
  import context._
  import MetricsActor._

  val maxGroupSize = 20
  val interval: FiniteDuration = 1.minute
  timers.startTimerWithFixedDelay(Tick, Tick, interval)

  private def putData(data: Seq[MetricDatum]): Future[Unit] = Future {
    val aggregatedMetrics: Seq[MetricDatum] = data
      .groupBy(metric => (metric.getMetricName, metric.getDimensions))
      .map { case (_, values) =>
        values.reduce((m1, m2) => m1.clone()
          .withValue(null)
          .withStatisticValues(aggregateMetricStats(m1,m2)))
      }
      .toSeq

    aggregatedMetrics.grouped(maxGroupSize).foreach(chunkedMetrics => { //can only send max 20 metrics to CW at a time
      client.putMetricData(new PutMetricDataRequest()
        .withNamespace(namespace)
        .withMetricData(chunkedMetrics.asJava))
    })

    logger.info(s"Put ${data.size} metric data points (aggregated to ${aggregatedMetrics.size} points) to namespace $namespace")
  }.recover {
    case e => logger.error("Error while publishing metrics", e)
  }

  private def aggregateMetricStats(metricDatumOriginal: MetricDatum, metricDatumNew: MetricDatum): StatisticSet = {
    metricDatumOriginal.getStatisticValues match {
      case stats if stats == null =>
        new StatisticSet()
          .withMinimum(Math.min(metricDatumOriginal.getValue, metricDatumNew.getValue))
          .withMaximum(Math.max(metricDatumOriginal.getValue, metricDatumNew.getValue))
          .withSum(metricDatumOriginal.getValue + metricDatumNew.getValue)
          .withSampleCount(if (metricDatumOriginal.getUnit.equals(StandardUnit.Count.toString)) 1d else 2d)
      case stats =>
        new StatisticSet()
          .withMinimum(Math.min(stats.getMinimum, metricDatumNew.getValue))
          .withMaximum(Math.max(stats.getMinimum, metricDatumNew.getValue))
          .withSum(stats.getSum + metricDatumNew.getValue)
          .withSampleCount(if (metricDatumOriginal.getUnit.equals(StandardUnit.Count.toString)) 1d else stats.getSampleCount + 1)
    }
  }

  def receive: Receive = {
    case AddMetrics(metrics) => become(queued(metrics))
  }
  def queued(queuedMetrics: Seq[MetricDatum]): Receive = {
    case Tick =>
      putData(queuedMetrics) // send metrics off
      become(receive)
    case AddMetrics(metrics) => become(queued(queuedMetrics ++ metrics))
  }
}


