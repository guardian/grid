package lib.elasticsearch

import play.api.libs.json.JsValue

/** A simple case class that carries the original ES source data with the deserialised instance */
case class SourceWrapper[T](source: JsValue, instance: T)
