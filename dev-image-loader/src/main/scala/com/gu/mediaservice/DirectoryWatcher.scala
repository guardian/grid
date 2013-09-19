package com.gu.mediaservice

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._
import java.nio.file._
import java.util.concurrent.Executors


object DirectoryWatcher {

  val threadPool = Executors.newFixedThreadPool(4)

  implicit val ctx: ExecutionContext = ExecutionContext.fromExecutorService(threadPool)

  def watch(path: Path, kinds: WatchEvent.Kind[Path]*)(f: WatchEvent[Path] => Unit) {
    val watcher = FileSystems.getDefault.newWatchService
    val key = path.register(watcher, kinds: _*)
    while (key.isValid) {
      val events = key.pollEvents.asScala.toList map (_.asInstanceOf[WatchEvent[Path]])
      for (event <- events) f(event)
      key.reset()
    }
  }

}
