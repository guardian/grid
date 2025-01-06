package com.gu.mediaservice.lib.events

import org.apache.pekko.actor.{Actor, ActorSystem, Props}
import org.apache.pekko.pattern.ask
import org.apache.pekko.util.Timeout
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Instance
import play.api.inject.ApplicationLifecycle

import scala.concurrent.duration.DurationInt
import scala.util.Random

class UsageEvents(actorSystem: ActorSystem, applicationLifecycle: ApplicationLifecycle) {

  private val random = new Random()
  private val usageEventsActor = actorSystem.actorOf(UsageEventsActor.props(), s"usageeventsactor-${random.alphanumeric.take(8).mkString}")

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
  def props(): Props =
    Props(new UsageEventsActor())

  final case object Shutdown
}


private class UsageEventsActor() extends Actor with GridLogging {
  override def receive: Receive = {
    case usageEvent: UsageEvent =>
      logger.info("Got usageEvent: " + usageEvent)
  }

}
