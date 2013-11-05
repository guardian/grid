package com.gu.mediaservice.lib.metrics

import scala.collection.JavaConverters._
import org.slf4j.LoggerFactory

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.cloudwatch.{AmazonCloudWatch, AmazonCloudWatchClient}
import com.amazonaws.services.cloudwatch.model.{MetricDatum, PutMetricDataRequest}

import scalaz.concurrent.Task
import scalaz.stream.async, async.mutable.Topic
import scalaz.stream.Process.{Sink, constant, emitAll}
import scalaz.syntax.id._


trait Metrics {

  def namespace: String
  def credentials: AWSCredentials

  def chunkSize: Int = 10

  class CountMetric(name: String) extends Metric[Long](name) {

    protected def toDatum(a: Long) = new MetricDatum().withMetricName(name).withValue(a.toDouble)

    override val mergeData = Some((_: Seq[Long]).sum)

    def increment(): Unit = recordOne(1)
  }

  abstract class Metric[A](val name: String) {

    private final val topic: Topic[A] = async.topic[A]

    final def recordOne(a: A): Unit =
      topic.publishOne(a).runAsync(loggingErrors)

    final def recordMany(as: Seq[A]): Unit =
      emitAll(as).toSource.to(topic.publish).run.runAsync(loggingErrors)

    /** Must be implemented to provide a way to turn an `A` into a `MetricDatum` */
    protected def toDatum(a: A): MetricDatum

    /** Can be overridden to provide a way of merging multiple values into one */
    protected val mergeData: Option[Seq[A] => A] = None

    private val sink: Sink[Task, Seq[A]] = constant { data => Task {
      val metricData = mergeData.foldLeft(data)((ds, op) => Seq(op(ds))).map(toDatum)
      client.putMetricData(new PutMetricDataRequest()
        .withNamespace(namespace)
        .withMetricData(metricData.asJavaCollection))
    }}

    protected final lazy val logger = LoggerFactory.getLogger(getClass)

    import scalaz.{\/-, -\/, \/}
    private final val loggingErrors: Throwable \/ Unit => Unit = {
      case -\/(error) => logger.error(s"Metric $name encountered error while publishing", error)
      case \/-(_) =>
    }

    /** Subscribe the metric publishing sink to the topic */
    topic.subscribe.chunk(chunkSize).to(sink).run.runAsync(loggingErrors)

  }

  private final val client: AmazonCloudWatch =
    new AmazonCloudWatchClient(credentials) <| (_ setEndpoint "monitoring.eu-west-1.amazonaws.com")

}
