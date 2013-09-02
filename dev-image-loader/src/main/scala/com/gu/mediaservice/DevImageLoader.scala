package com.gu.mediaservice

import scala.concurrent.ExecutionContext
import scala.concurrent.duration._
import akka.actor.ActorSystem


object DevImageLoader extends App {

  val system = ActorSystem("DevImageLoader")

  implicit val ctx: ExecutionContext = system.dispatcher

  val picdar = new Picdar()

  system.scheduler.schedule(0 seconds, 1 minute)(downloadSomeImages())

  def downloadSomeImages() {
    for (images <- picdar.latestResults()) {
      images foreach { img => println(s"Loading image: $img") }
    }
  }

}
