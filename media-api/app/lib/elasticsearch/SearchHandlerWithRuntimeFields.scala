package lib.elasticsearch

import com.sksamuel.elastic4s.HttpEntity.StringEntity
import com.sksamuel.elastic4s.{ElasticRequest, Handler}
import com.sksamuel.elastic4s.requests.searches.{SearchHandlers, SearchRequest, SearchResponse}
import play.api.libs.json.{JsObject, JsValue, Json}

case class RuntimeFieldScript(source: String)

case class RuntimeFieldDefinition(`type`: String, script: RuntimeFieldScript)

case class SearchHandlerWithRuntimeFields(logInfo: String => Unit, fieldScripts: Map[String, RuntimeFieldDefinition])
  extends Handler[SearchRequest, SearchResponse] with SearchHandlers {

  implicit val writesRuntimeFieldScript = Json.writes[RuntimeFieldScript]
  implicit val writesRuntimeFieldDefinition = Json.writes[RuntimeFieldDefinition]

  override def build(t: SearchRequest): ElasticRequest = {
    val originalRequest = SearchHandler.build(t)
    val maybeBodyStr = originalRequest.entity.map(_.get)
    val maybeBodyJSON = maybeBodyStr.map(Json.parse).flatMap(_.asOpt[JsObject])
    val runtimeFieldsJSON: JsValue = Json.toJson(fieldScripts)
    val maybeBodyWithRuntimeFields = maybeBodyJSON.map(_ + ("runtime_mappings" -> runtimeFieldsJSON)).map(Json.stringify)
    maybeBodyWithRuntimeFields.fold(
      originalRequest
    ) { bodyContent =>
      logInfo(s"Modified SearchRequest, body: $bodyContent")
      originalRequest.copy(entity = Some(StringEntity(
        content = bodyContent,
        contentCharset = originalRequest.entity.flatMap(_.contentCharset))
      ))
    }
  }
}
