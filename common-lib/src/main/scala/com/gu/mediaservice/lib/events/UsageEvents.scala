package com.gu.mediaservice.lib.events

import org.apache.pekko.actor.{Actor, ActorSystem, Props}
import org.apache.pekko.pattern.ask
import org.apache.pekko.util.Timeout
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Instance
import play.api.inject.ApplicationLifecycle

import scala.concurrent.duration.DurationInt
import scala.util.Random
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest

class UsageEvents(actorSystem: ActorSystem, applicationLifecycle: ApplicationLifecycle, sqsClient: SqsClient, queueUrl: String) {

  private val random = new Random()
  private val usageEventsActor = actorSystem.actorOf(UsageEventsActor.props(sqsClient, queueUrl), s"usageeventsactor-${random.alphanumeric.take(8).mkString}")

  applicationLifecycle.addStopHook(() => (usageEventsActor ? UsageEventsActor.Shutdown)(Timeout(5.seconds)))

  def successfulIngestFromQueue(instance: Instance, id: String, filesize: Long): Unit = {
    usageEventsActor ! UsageEvent(`type` = "imageIngest", instance = instance.id, id = Some(id), filesize = Some(filesize))
  }

  def successfulUpload(instance: Instance, id: String, filesize: Long): Unit = {
    usageEventsActor ! UsageEvent(`type` = "imageUpload", instance = instance.id, id = Some(id), filesize = Some(filesize))
  }

  def downloadOriginal(instance: Instance, id: String, filesize: Option[Long]): Unit = {
    usageEventsActor ! UsageEvent(`type` = "downloadOriginal", instance = instance.id, id = Some(id), filesize = filesize)
  }

}

case class UsageEvent(`type`: String, instance: String, id: Option[String], filesize: Option[Long])

object UsageEventsActor {
  def props(sqsClient: SqsClient, queueUrl: String): Props =
    Props(new UsageEventsActor(sqsClient, queueUrl))

  final case object Shutdown
}


private class UsageEventsActor(sqsClient: SqsClient, queueUrl: String) extends Actor with GridLogging {
  override def receive: Receive = {
    case usageEvent: UsageEvent =>
      logger.info("Got usageEvent: " + usageEvent)
      send(usageEvent)
  }

  def send(usageEvent: UsageEvent): Unit = {
    import play.api.libs.json._
    implicit val uew = Json.writes[UsageEvent]
    val message = Json.toJson(usageEvent).toString()
    sqsClient.sendMessage(SendMessageRequest.builder.queueUrl(queueUrl).messageBody(Json.toJson(message).toString()).build)
  }

}
