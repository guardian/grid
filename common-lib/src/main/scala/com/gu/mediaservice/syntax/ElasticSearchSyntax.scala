package com.gu.mediaservice
package syntax

import java.util.regex.Pattern

import scala.concurrent.{ExecutionContext, Future}

import org.elasticsearch.action.{ActionResponse, ActionRequest, ActionRequestBuilder, ListenableActionFuture}
import org.elasticsearch.action.get.GetResponse
import org.elasticsearch.search.aggregations.bucket.terms.TermsBuilder

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
      future.onFailure { case e => Logger.error(s"$message - query failed after ${elapsed()} ms: ${e.getMessage} cs: ${e.getCause}") }
      future
    }
  }

  final implicit class SearchHitSyntax(self: SearchHit) {
    def sourceOpt: Option[JsValue] = Option(self.getSourceAsString) map Json.parse
  }

  final implicit class TermsBuilderSyntax(self: TermsBuilder) {
    // Annoyingly you can't exclude by array in the JAVA API
    // although you can in the REST client
    def excludeList(list: List[String]) = {
      self.exclude(list.map(Pattern.quote).mkString("|"))
    }
  }

}

object ElasticSearchSyntax extends ElasticSearchSyntax
