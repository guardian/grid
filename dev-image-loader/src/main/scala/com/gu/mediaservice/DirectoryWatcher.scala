package com.gu.mediaservice

import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._
import java.nio.file._
import java.util.concurrent.Executors
import StandardWatchEventKinds._


case class FStream[A](run: Future[(A, FStream[A])])(implicit ex: ExecutionContext) {

  def map[B](f: A => B): FStream[B] =
    FStream(for ((a, as) <- run) yield (f(a), as.map(f)))

  def foreach(f: A => Unit): Unit =
    for ((a, as) <- run) { f(a); as.foreach(f) }

  def unfold[B](f: A => Future[B]): FStream[B] =
    FStream(for ((a, as) <- run; b <- f(a)) yield (b, as.unfold(f)))
}

object DirectoryWatcher {

  val threadPool = Executors.newFixedThreadPool(4)

  implicit val ctx: ExecutionContext = ExecutionContext.fromExecutorService(threadPool)

  def watch(path: String): FStream[List[WatchEvent[Path]]] = {

    val watcher = FileSystems.getDefault.newWatchService
    val watchedDir = Paths.get(path)
    watchedDir.register(watcher, ENTRY_CREATE, ENTRY_DELETE, ENTRY_MODIFY)
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
