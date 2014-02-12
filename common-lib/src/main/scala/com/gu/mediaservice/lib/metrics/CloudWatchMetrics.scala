package com.gu.mediaservice.lib.metrics

import scala.collection.JavaConverters._
import scala.concurrent.duration._
import org.slf4j.LoggerFactory

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.cloudwatch.{AmazonCloudWatch, AmazonCloudWatchClient}
import com.amazonaws.services.cloudwatch.model.{Dimension, StandardUnit, MetricDatum, PutMetricDataRequest}

import scalaz.concurrent.Task
import scalaz.stream.async, async.mutable.Topic
import scalaz.stream.Process.{Sink, constant, emitAll}
import scalaz.syntax.id._

trait Metric[A] {

  def recordOne(a: A, dimensions: List[Dimension] = Nil): Task[Unit]

  def recordMany(as: Seq[A], dimensions: List[Dimension] = Nil): Task[Unit]

  def runRecordOne(a: A, dimensions: List[Dimension] = Nil): Unit

  def runRecordMany(as: Seq[A], dimensions: List[Dimension] = Nil): Unit
}

abstract class CloudWatchMetrics(namespace: String, credentials: AWSCredentials) {

  /** The maximum number of data points to report in one batch.
    * (Each batch costs 1 HTTP request to CloudWatch)
    */
  val maxChunkSize: Int = 20

  /** The maximum time to wait between reports, when there is data enqueued.
    *
    * Will report more often than this, if the number of enqueued data points
    * exceeds `maxChunkSize`.
    */
  val maxAge: Duration = 1.minute

  class CountMetric(name: String) extends CloudWatchMetric[Long](name) {

    protected def toDatum(a: Long, dimensions: List[Dimension]) = datum(StandardUnit.Count, a, dimensions)

    def increment(n: Long = 1, dimensions: List[Dimension] = Nil): Task[Unit] = recordOne(n, dimensions)

  }

  class TimeMetric(name: String) extends CloudWatchMetric[Long](name) {
    protected def toDatum(a: Long, dimensions: List[Dimension]) = datum(StandardUnit.Milliseconds, a, dimensions)
  }

  private lazy val logger = LoggerFactory.getLogger(getClass)

  private val topic: Topic[MetricDatum] = async.topic[MetricDatum]

  private val sink: Sink[Task, Seq[MetricDatum]] = constant { data =>
    putData(data).handle { case e: RuntimeException => logger.error(s"Error while publishing metrics", e) }
  }

  private val client: AmazonCloudWatch =
    new AmazonCloudWatchClient(credentials) <| (_ setEndpoint "monitoring.eu-west-1.amazonaws.com")

  private def putData(data: Seq[MetricDatum]): Task[Unit] = Task {
    client.putMetricData(new PutMetricDataRequest()
      .withNamespace(namespace)
      .withMetricData(data.asJava))
    logger.info(s"Put ${data.size} metric data points to namespace $namespace")
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

  import scalaz.{\/, -\/, \/-}

  private[metrics] val loggingErrors: Throwable \/ Unit => Unit = {
    case -\/(e) => logger.error(s"Error while publishing metrics", e)
    case \/-(_) =>
  }

}
