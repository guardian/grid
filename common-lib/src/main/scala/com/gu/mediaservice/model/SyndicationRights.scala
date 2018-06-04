package com.gu.mediaservice.model

import org.joda.time.DateTime

case class RCSUpdate(
  id: String,
  published: Option[DateTime],
  suppliers: Seq[Supplier],
  prAgreement: Boolean,
  contentRights: Seq[RightAcquisition])

object RCSUpdate {
}

case class Supplier(
  supplierName: String,
  supplierId: String)

object Supplier {
}

case class RightAcquisition(
  code: String,
  acquired: Boolean,
  properties: Option[Seq[Property]])

object RightAcquisition {
}

case class Property(
  code: String,
  expiresOn: Option[DateTime],
  value: Option[String])

object Property {
}
