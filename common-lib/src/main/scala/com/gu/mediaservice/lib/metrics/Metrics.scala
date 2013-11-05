package com.gu.mediaservice.lib.metrics

import scala.collection.JavaConverters._
import org.slf4j.LoggerFactory

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.cloudwatch.{AmazonCloudWatch, AmazonCloudWatchClient}
import com.amazonaws.services.cloudwatch.model.{StandardUnit, MetricDatum, PutMetricDataRequest}

import scalaz.concurrent.Task
import scalaz.stream.async, async.mutable.Topic
import scalaz.stream.Process.{Sink, constant, emitAll}
import scalaz.syntax.id._


trait Metrics {

  def namespace: String
  def credentials: AWSCredentials

  val chunkSize: Int = 10

  final val topic: Topic[MetricDatum] = async.topic[MetricDatum]

  final val client: AmazonCloudWatch =
    new AmazonCloudWatchClient(credentials) <| (_ setEndpoint "monitoring.eu-west-1.amazonaws.com")

  final val sink: Sink[Task, Seq[MetricDatum]] = constant { data => Task {
    client.putMetricData(new PutMetricDataRequest()
      .withNamespace(namespace)
      .withMetricData(data.asJavaCollection))
  }}

  class CountMetric(name: String) extends Metric[Long](name) {

    protected def toDatum(a: Long) =
      new MetricDatum().withMetricName(name).withUnit(StandardUnit.Count).withValue(a.toDouble)

    def increment(): Unit = recordOne(1)
  }

  abstract class Metric[A](val name: String) {

    final def recordOne(a: A): Unit =
      topic.publishOne(toDatum(a).withTimestamp(new java.util.Date)).runAsync(loggingErrors)

    final def recordMany(as: Seq[A]): Unit =
      emitAll(as map (a => toDatum(a).withTimestamp(new java.util.Date)))
        .toSource.to(topic.publish).run.runAsync(loggingErrors)

    /** Must be implemented to provide a way to turn an `A` into a `MetricDatum` */
    protected def toDatum(a: A): MetricDatum

  }

  private val logger = LoggerFactory.getLogger(getClass)

  import scalaz.{\/-, -\/, \/}
  private val loggingErrors: Throwable \/ Unit => Unit = {
    case -\/(error) => logger.error(s"Encountered error while publishing metrics", error)
    case \/-(_) =>
  }

  /** Subscribe the metric publishing sink to the topic */
  topic.subscribe.chunk(chunkSize).to(sink).run.runAsync(loggingErrors)

}
