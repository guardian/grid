package lib.rx

import rx.lang.scala.schedulers.ExecutionContextScheduler
import java.util.concurrent.Executors
import scala.concurrent.ExecutionContext


trait SingleThreadedScheduler {
  private val singleThreadedExecutor = Executors.newSingleThreadExecutor()
  val scheduler = ExecutionContextScheduler(ExecutionContext.fromExecutor(singleThreadedExecutor))
}


