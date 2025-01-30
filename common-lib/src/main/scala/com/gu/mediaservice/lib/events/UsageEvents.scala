package com.gu.mediaservice.lib.events

import org.apache.pekko.actor.{Actor, ActorSystem, Props}
import org.apache.pekko.pattern.ask
import org.apache.pekko.util.Timeout
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Instance
import org.joda.time.DateTime
import play.api.inject.ApplicationLifecycle
import play.api.libs.json.{JodaWrites, Json, OWrites}
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.SendMessageRequest

import scala.concurrent.duration.DurationInt
import scala.util.Random

class UsageEvents(actorSystem: ActorSystem, applicationLifecycle: ApplicationLifecycle, sqsClient: SqsClient, queueUrl: String) {

  private val random = new Random()
  private val usageEventsActor = actorSystem.actorOf(UsageEventsActor.props(sqsClient, queueUrl), s"usageeventsactor-${random.alphanumeric.take(8).mkString}")

  applicationLifecycle.addStopHook(() => (usageEventsActor ? UsageEventsActor.Shutdown)(Timeout(5.seconds)))

  def successfulIngestFromQueue(instance: Instance, image: String, filesize: Long): Unit = {
    usageEventsActor ! UsageEvent(`type` = "imageIngest", instance = instance.id, image = Some(image), filesize = Some(filesize))
  }

  def prepare(instance: Instance, image: String, user: String): Unit = {
    usageEventsActor ! UsageEvent(`type` = "prepareUpload", instance = instance.id, image = Some(image), user = Some(user))
  }

  def successfulUpload(instance: Instance, image: String, filesize: Long): Unit = {
    usageEventsActor ! UsageEvent(`type` = "imageUpload", instance = instance.id, image = Some(image), filesize = Some(filesize))
  }

  def downloadOriginal(instance: Instance, image: String, filesize: Option[Long]): Unit = {
    usageEventsActor ! UsageEvent(`type` = "downloadOriginal", instance = instance.id, image = Some(image), filesize = filesize)
  }

  def apiKeyUsed(instance: Instance, apiKey: String) = {
    usageEventsActor ! UsageEvent(`type` = "apiKeyUsed", instance = instance.id, apiKey = Some(apiKey))
  }

  def userAuthed(instance: Instance, user: String) = {
    usageEventsActor ! UsageEvent(`type` = "userAuthed", instance = instance.id, user = Some(user))
  }
}

case class UsageEvent(`type`: String, instance: String,
                      image: Option[String] = None,
                      filesize: Option[Long] = None,
                      date: DateTime = DateTime.now,
                      apiKey: Option[String] = None,
                      user: Option[String] = None)

object UsageEvent extends JodaWrites {
  implicit val uew: OWrites[UsageEvent] = Json.writes[UsageEvent]
}

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
    sqsClient.sendMessage(SendMessageRequest.builder.queueUrl(queueUrl).messageBody(Json.stringify(Json.toJson(usageEvent))).build)
  }

}
