package com.gu.mediaservice.lib.resource

import scala.concurrent.{ExecutionContext, Future}

object FutureResources {

  /** Bracket the creation of a Future with resource creation and cleanup actions.
    * The cleanup is run regardless of whether the Future was successful.
    */
  def bracket[R, A](acquire: => Future[R])
                    (cleanup: R => Unit)
                    (f: R => Future[A])
                    (implicit ctx: ExecutionContext): Future[A] =
    acquire.flatMap { resource =>
      val future = f(resource)
      future.onComplete(_ => cleanup(resource))
      future
    }

}
