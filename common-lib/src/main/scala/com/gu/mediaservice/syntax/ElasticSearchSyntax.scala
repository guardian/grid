package com.gu.mediaservice
package syntax

import java.util.regex.Pattern

import org.elasticsearch.action.get.GetResponse
import org.elasticsearch.action.{ActionRequest, ActionRequestBuilder, ActionResponse, ListenableActionFuture}
import org.elasticsearch.search.SearchHit
import org.elasticsearch.search.aggregations.bucket.terms.TermsBuilder
import play.api.{Logger, MarkerContext}
import play.api.libs.json.{JsValue, Json}
import net.logstash.logback.marker.Markers.appendEntries

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}


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
      val start = System.currentTimeMillis()
      val result = self.execute().asScala

      result.foreach { _ =>
        val elapsed = System.currentTimeMillis() - start
        val markers = MarkerContext(appendEntries(Map(
          "duration" -> elapsed
        ).asJava))

        Logger.info(s"$message - query returned successfully in $elapsed ms")(markers)
      }

      result.failed.foreach { e =>
        val elapsed = System.currentTimeMillis() - start
        val markers = MarkerContext(appendEntries(Map(
          "duration" -> elapsed
        ).asJava))

        Logger.error(s"$message - query failed after $elapsed ms: ${e.getMessage} cs: ${e.getCause}")(markers)
      }

      result
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
