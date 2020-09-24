package com.gu.mediaservice.lib.config

import play.api.libs.json._


case class UsageRightsConfig(
                              supplierCreditMatches: List[SupplierMatch],
                              supplierParsers: List[String],
                              usageRights: List[String],
                              freeSuppliers: List[String],
                              suppliersCollectionExcl: Map[String, List[String]]) {

  def isFreeSupplier(supplier: String) = freeSuppliers.contains(supplier)

  def isExcludedColl(supplier: String, supplierColl: String) =
    suppliersCollectionExcl.get(supplier).exists(_.contains(supplierColl))
}

case class SupplierMatch(name: String, creditMatches: List[String], sourceMatches: List[String])

object SupplierMatch {
  implicit val supplierMatchesFormats = Json.format[SupplierMatch]
}

object UsageRightsConfig {
  implicit val metadataConfigClassFormats = Json.format[UsageRightsConfig]
}
