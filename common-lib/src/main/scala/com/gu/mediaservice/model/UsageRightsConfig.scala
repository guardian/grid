package com.gu.mediaservice.model

case class UsageRightsConfig(
                          category: String,
                          name: String,
                          description: String,
                          requiredFields: List[String] = Nil,
                          optionalFields: List[String] = Nil,
                          legacyCategories: List[String] = Nil

                     )

object UsageRightsConfig {

  val rights = List(
    UsageRightsConfig(
      "",
      "Unknown Rights",
      "Images which we do not currently have the rights to use.",
    ),
    UsageRightsConfig(
      "chargeable",
      "Pay to use",
      "Images acquired by or supplied to ",
    ),
    UsageRightsConfig(
      "handout",
      "Handout",
      "Images supplied on general release to all media e.g. images provided by police for new",
      optionalFields = List("restrictions"),
    ),
    UsageRightsConfig(
      "commissioned-agency",
      "Agency - commissioned",
      "Images commissioned from agencies on an ad hoc basis.",
      requiredFields = List("supplier"), optionalFields = List("restrictions")
    ),
    UsageRightsConfig(
      "pr-and-third-party",
      "Pr & Third Party",
      "Images received from PRs or as handouts, by default you must explain the restrictions that apply.",
      optionalFields = List("restrictions"),
      legacyCategories = List("handout", "commissioned-agency")
    )
  )

  val byId = rights.map(config => config.category -> config).toMap
  val mappedCategories = rights.map(config => (config.category -> config.legacyCategories)).toMap

  val invertedMappedCategories = mappedCategories.foldLeft(Map[String, String]())({case (acc, (k, values)) => {
      values.map(v => v -> k).toMap ++ acc
  }})


}
