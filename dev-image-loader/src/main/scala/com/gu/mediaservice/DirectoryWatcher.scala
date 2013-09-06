package com.gu.mediaservice

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._
import java.nio.file._
import java.util.concurrent.Executors

import com.gu.mediaservice.util.FStream


object DirectoryWatcher {

  val threadPool = Executors.newFixedThreadPool(4)

  implicit val ctx: ExecutionContext = ExecutionContext.fromExecutorService(threadPool)

  def watchF(path: Path, kinds: WatchEvent.Kind[Path]*): FStream[List[WatchEvent[Path]]] = {

    val watcher = FileSystems.getDefault.newWatchService
    val key = path.register(watcher, kinds: _*)

    FStream.continually(Future {
      assert(key.isValid)
      watcher.take()
      val events = key.pollEvents.asScala.toList map (_.asInstanceOf[WatchEvent[Path]])
      key.reset()
      events
    })
  }

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
