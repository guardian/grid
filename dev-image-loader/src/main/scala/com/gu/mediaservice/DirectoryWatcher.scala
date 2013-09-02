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

  /** Interleave two streams, taking values from either as soon as they are available.
    */
  def nonDeterministicInterleave(that: FStream[A]): FStream[A] = {
    def f(lefts: FStream[Either[A, A]], rights: FStream[Either[A, A]]): FStream[Either[A, A]] =
      FStream(Future.firstCompletedOf(Seq(lefts.run, rights.run)) map {
        case (left @ Left(_), ls)  => (left, ls.nonDeterministicInterleave(rights))
        case (right @ Right(_), rs) => (right, rs.nonDeterministicInterleave(lefts))
      })
    f(this map Left.apply, that map Right.apply) map (_.merge)
  }
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
