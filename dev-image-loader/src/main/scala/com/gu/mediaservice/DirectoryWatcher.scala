package com.gu.mediaservice

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._
import java.nio.file._
import java.util.concurrent.Executors

import com.gu.mediaservice.util.FStream


object DirectoryWatcher {

  val threadPool = Executors.newFixedThreadPool(4)

  implicit val ctx: ExecutionContext = ExecutionContext.fromExecutorService(threadPool)

  def watch(path: String, kinds: WatchEvent.Kind[Path]*): FStream[List[WatchEvent[Path]]] = {

    val watcher = FileSystems.getDefault.newWatchService
    val watchedDir = Paths.get(path)
    watchedDir.register(watcher, kinds: _*)
    var key: WatchKey = null

    def f(): FStream[List[WatchEvent[Path]]] = FStream {
      for {
        head <- Future {
          key = watcher.take()
          key.pollEvents.asScala.toList map (_.asInstanceOf[WatchEvent[Path]])
        }
        _ = key.reset()
        tail = f()
      } yield (head, tail)
    }
    f()
  }

}
