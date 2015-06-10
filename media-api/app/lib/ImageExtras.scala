package lib

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.model._


object ImageExtras {
  def isValid(metadata: JsValue): Boolean =
    Config.requiredMetadata.forall(field => (metadata \ field).asOpt[String].isDefined)
}
