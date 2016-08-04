package com.gu.mediaservice.model

import play.api.libs.json._

sealed trait Cost
case object Free
  extends Cost { override def toString = "free" }

case object Conditional
  extends Cost { override def toString = "conditional" }

case object Pay
  extends Cost { override def toString = "pay" }

case object Overquota
  extends Cost { override def toString = "overquota" }

object Cost {
  def fromString(string: String): Cost =
    Vector(Free, Conditional, Pay).find(_.toString == string).getOrElse(Pay)

  implicit val CostReads: Reads[Cost] = __.read[String].map(fromString)

  implicit val CostWrites: Writes[Cost] = Writes[Cost](c => JsString(c.toString))

}
