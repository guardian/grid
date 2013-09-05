package lib.syntax

import scala.concurrent.Future
import org.elasticsearch.action.ListenableActionFuture
import org.elasticsearch.action.get.GetResponse
import play.api.libs.json.{Json, JsValue}
import lib.elasticsearch.FutureConversions


trait ElasticSearchSyntax {

  final implicit class ListenableActionFutureSyntax[A](self: ListenableActionFuture[A]) {
    def asScala: Future[A] = FutureConversions(self)
  }

  final implicit class GetResponseSyntax(self: GetResponse) {
    def sourceAsJson: JsValue = Json.parse(self.getSourceAsBytes)
  }

}

object ElasticSearchSyntax extends ElasticSearchSyntax
