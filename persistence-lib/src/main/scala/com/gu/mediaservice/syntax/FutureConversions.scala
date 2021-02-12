package com.gu.mediaservice.syntax

import org.elasticsearch.action.{ActionListener, ListenableActionFuture}

import scala.concurrent.{Future, Promise}

object FutureConversions {

  def apply[A](future: ListenableActionFuture[A]): Future[A] = {
    val promise = Promise[A]()
    future.addListener(new ActionListener[A] {
      def onFailure(e: Throwable) { promise.failure(e) }
      def onResponse(response: A) { promise.success(response) }
    })
    promise.future
  }

}
