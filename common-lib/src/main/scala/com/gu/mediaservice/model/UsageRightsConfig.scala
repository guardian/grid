package com.gu.mediaservice.model

import play.api.libs.json.{Json, OFormat}

case class UsageRightsConfig(
                            category: String,
                            name: String,
                            description: String,
                            requiredFields: List[String] = Nil,
                            optionalFields: List[String] = Nil,
                            legacyCategories: List[String] = Nil

                     )

object UsageRightsConfig {
  implicit val jsonFormat: OFormat[UsageRightsConfig] = Json.format[UsageRightsConfig]
}

class UsageRightsConfiguration(rights: List[UsageRightsConfig]) {

  val byId = rights.map(config => config.category -> config).toMap
  val mappedCategories = rights.map(config => (config.category -> config.legacyCategories)).toMap

  val invertedMappedCategories = mappedCategories.foldLeft(Map[String, String]())({case (acc, (k, values)) => {
      values.map(v => v -> k).toMap ++ acc
  }})


}
