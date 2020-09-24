package com.gu.mediaservice.lib.config

import play.api.libs.json._

case class UsageRightsConfig(usageRights: List[String], freeSuppliers: List[String], suppliersCollectionExcl: Map[String, List[String]]) {
  def isFreeSupplier(supplier: String) = freeSuppliers.contains(supplier)

  def isExcludedColl(supplier: String, supplierColl: String) =
    suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}

object UsageRightsConfig {
  implicit val metadataConfigClassFormats = Json.format[UsageRightsConfig]
}
