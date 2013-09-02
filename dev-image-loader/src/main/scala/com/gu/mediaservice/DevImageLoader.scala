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


import scala.concurrent.Future
import scala.collection.JavaConverters._
import java.nio.file._
import java.util.concurrent.Executors
import StandardWatchEventKinds._

object DirectoryWatcher {

  case class FStream[A](run: Future[(A, FStream[A])]) {

    def map[B](f: A => B): FStream[B] =
      FStream(for ((a, as) <- run) yield (f(a), as.map(f)))

    def foreach(f: A => Unit): Unit =
      for ((a, as) <- run) { f(a); as.foreach(f) }
  }

  val threadPool = Executors.newFixedThreadPool(4)

  implicit val ctx: ExecutionContext = ExecutionContext.fromExecutorService(threadPool)

  def watch(path: String): FStream[List[WatchEvent[Path]]] = {
    val watcher = FileSystems.getDefault.newWatchService
    val watchedDir = Paths.get(path)
    watchedDir.register(watcher, ENTRY_CREATE, ENTRY_DELETE, ENTRY_MODIFY)
    var key: WatchKey = null
    FStream {
      for {
        head <- Future {
          key = watcher.take()
          key.pollEvents().asScala.toList map (_.asInstanceOf[WatchEvent[Path]])
        }
        _ = key.reset()
        tail = watch(path)
      } yield (head, tail)
    }
  }

  def shutdown() {
    threadPool.shutdown()
  }
}
