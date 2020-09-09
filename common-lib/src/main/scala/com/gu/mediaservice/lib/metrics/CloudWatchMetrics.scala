package com.gu.mediaservice.lib.metrics

import com.amazonaws.services.cloudwatch.model._
import com.amazonaws.services.cloudwatch.{AmazonCloudWatch, AmazonCloudWatchClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import org.slf4j.LoggerFactory
import scalaz.concurrent.Task
import scalaz.stream.Process.{constant, emitAll}
import scalaz.stream.async.mutable.Topic
import scalaz.stream.{Sink, async}

import scala.collection.JavaConverters._
import scala.concurrent.duration._

trait Metric[A] {

  def recordOne(a: A, dimensions: List[Dimension] = Nil): Task[Unit]

  def recordMany(as: Seq[A], dimensions: List[Dimension] = Nil): Task[Unit]

  def runRecordOne(a: A, dimensions: List[Dimension] = Nil): Unit

  def runRecordMany(as: Seq[A], dimensions: List[Dimension] = Nil): Unit
}

abstract class CloudWatchMetrics(namespace: String, config: CommonConfig) {

  /** The maximum number of data points to report in one batch.
    * (Each batch costs 1 HTTP request to CloudWatch)
    */
  val maxChunkSize: Int = Int.MaxValue

  /** The maximum time to wait between reports, when there is data enqueued.
    *
    * Will report more often than this, if the number of enqueued data points
    * exceeds `maxChunkSize`.
    */
  val maxAge: Duration = 1.minute

  import scalaz.{-\/, \/, \/-}

  private[metrics] val loggingErrors: Throwable \/ Unit => Unit = {
    case -\/(e) => logger.error(s"Error while publishing metrics", e)
    case \/-(_) =>
  }

  class CountMetric(name: String) extends CloudWatchMetric[Long](name) {

    protected def toDatum(a: Long, dimensions: List[Dimension]) = datum(StandardUnit.Count, a, dimensions)

    def increment(dimensions: List[Dimension] = Nil, n: Long = 1): Task[Unit] = recordOne(n, dimensions)

  }

  class TimeMetric(name: String) extends CloudWatchMetric[Long](name) {
    protected def toDatum(a: Long, dimensions: List[Dimension]) = datum(StandardUnit.Milliseconds, a, dimensions)
  }

  private lazy val logger = LoggerFactory.getLogger(getClass)

  private val topic: Topic[MetricDatum] = async.topic[MetricDatum]()

  private val sink: Sink[Task, Seq[MetricDatum]] = constant { data =>
    putData(data).handle { case e: RuntimeException => logger.error(s"Error while publishing metrics", e) }
  }

  private val client: AmazonCloudWatch = config.withAWSCredentials(AmazonCloudWatchClientBuilder.standard()).build()

  private def putData(data: Seq[MetricDatum]): Task[Unit] = Task {

    val aggregatedMetrics: Seq[MetricDatum] = data
      .groupBy(metric => (metric.getMetricName, metric.getDimensions))
      .map { case (_, values) =>
        values.reduce((m1, m2) => m1.clone()
          .withValue(null)
          .withStatisticValues(aggregateMetricStats(m1,m2)))
      }
      .toSeq

    aggregatedMetrics.grouped(20).foreach(chunkedMetrics => { //can only send max 20 metrics to CW at a time
      client.putMetricData(new PutMetricDataRequest()
        .withNamespace(namespace)
        .withMetricData(chunkedMetrics.asJava))
      }
    )

    logger.info(s"Put ${data.size} metric data points (aggregated to ${aggregatedMetrics.size} points) to namespace $namespace")
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

  abstract class CloudWatchMetric[A](val name: String) extends Metric[A] {

    final def recordOne(a: A, dimensions: List[Dimension] = Nil): Task[Unit] =
      topic.publishOne(toDatum(a, dimensions).withTimestamp(new java.util.Date))

    final def recordMany(as: Seq[A], dimensions: List[Dimension] = Nil): Task[Unit] =
      emitAll(as map (a => toDatum(a, dimensions).withTimestamp(new java.util.Date)))
        .toSource.to(topic.publish).run

    final def runRecordOne(a: A, dimensions: List[Dimension] = Nil): Unit =
      recordOne(a, dimensions).runAsync(loggingErrors)

    final def runRecordMany(as: Seq[A], dimensions: List[Dimension] = Nil): Unit =
      recordMany(as, dimensions).runAsync(loggingErrors)

    /** Must be implemented to provide a way to turn an `A` into a `MetricDatum` */
    protected def toDatum(a: A, dimensions: List[Dimension]): MetricDatum

    /** Convenience method for instantiating a `MetricDatum` with this metric's `name` and `dimension` */
    protected def datum(unit: StandardUnit, value: Double, dimensions: List[Dimension]): MetricDatum =
      new MetricDatum()
        .withMetricName(name)
        .withUnit(unit)
        .withValue(value)
        .withDimensions(dimensions.asJava)

  }

  import com.gu.mediaservice.lib.Processes._

  /** Subscribe the metric publishing sink to the topic */
  topic.subscribe.chunkTimed(maxAge, maxChunkSize).to(sink).run.runAsync(loggingErrors)

}