package com.gu.mediaservice.model

import play.api.libs.json.{JsError, JsObject, JsString, JsSuccess, JsValue, Json, OWrites, Reads, Writes}

case class UsageRightsV2(
                         category: String,
                         fields: Map[String, String] = Map.empty,
                         legacyCategory: Option[String] = None
                        )

object UsageRightsV2 {

  implicit val jsonReads: Reads[UsageRightsV2] = Reads[UsageRightsV2] { json =>
    val category = (json \ "category").asOpt[String]

    (category map { c =>
      val mappedCategory = UsageRightsConfig.invertedMappedCategories.get(c)
      val category = mappedCategory.getOrElse(c)
      val config = UsageRightsConfig.byId(c)
      val requiredFields = config.requiredFields.map(field => {
        (field, (json \ field).as[String])
      }).toMap

      val optionalFields = config.optionalFields.map(field => {
        (field, (json \ field).asOpt[String])
      }).collect({ case (k, Some(v)) => k -> v }).toMap
      UsageRightsV2(category, requiredFields ++ optionalFields, Option.when(mappedCategory.isDefined)(c))
    })
      .orElse(if(json == Json.obj()) Some(UsageRightsV2("")) else None)
      .map(JsSuccess(_))
      .getOrElse(JsError(s"No such usage rights category: ${category.getOrElse("None")}"))
  }

  implicit def writes: Writes[UsageRightsV2] = new Writes[UsageRightsV2] {
    override def writes(o: UsageRightsV2): JsValue = {
      if(o.category == "") Json.obj()
      else new JsObject(Map("category" -> JsString(o.category)) ++ o.fields.view.mapValues(s => JsString(s)))
    }
  }

}
