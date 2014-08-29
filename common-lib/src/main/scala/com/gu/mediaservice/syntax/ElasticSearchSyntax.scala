package com.gu.mediaservice
package syntax

import scala.concurrent.{ExecutionContext, Future}

import org.elasticsearch.action.{ActionResponse, ActionRequest, ActionRequestBuilder, ListenableActionFuture}
import org.elasticsearch.action.get.GetResponse

import play.api.libs.json.{JsValue, Json}
import com.gu.mediaservice.lib.elasticsearch.FutureConversions
import play.api.Logger
import org.elasticsearch.search.SearchHit


trait ElasticSearchSyntax {

  final implicit class ListenableActionFutureSyntax[A](self: ListenableActionFuture[A]) {
    def asScala: Future[A] = FutureConversions(self)
  }

  final implicit class GetResponseSyntax(self: GetResponse) {
    def sourceOpt: Option[JsValue] = Option(self.getSourceAsString) map Json.parse
  }

  final implicit class ActionRequestBuilderSyntax[A <: ActionResponse]
      (self: ActionRequestBuilder[_ <: ActionRequest[_], A, _, _]) {

    def executeAndLog(message: => String)(implicit ex: ExecutionContext): Future[A] = {
      val elapsed = {
        val start = System.currentTimeMillis
        () => System.currentTimeMillis - start
      }
      val future = self.execute.asScala
      future.onSuccess { case _ => Logger.info(s"$message - query returned successfully in ${elapsed()} ms") }
      future.onFailure { case e => Logger.error(s"$message - query failed after ${elapsed()} ms: ${e.getMessage}") }
      future
    }
  }

  final implicit class SearchHitSyntax(self: SearchHit) {
    def sourceOpt: Option[JsValue] = Option(self.getSourceAsString) map Json.parse
  }

}

object ElasticSearchSyntax extends ElasticSearchSyntax
