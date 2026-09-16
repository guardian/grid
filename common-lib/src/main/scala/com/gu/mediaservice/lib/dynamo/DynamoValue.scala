package com.gu.mediaservice.lib.dynamo
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import scala.jdk.CollectionConverters._

sealed trait DynamoElement {
  def toAttrValue: AttributeValue
}


case class DbString(value: String) extends DynamoElement {
  def toAttrValue: AttributeValue = AttributeValue.builder().s(value).build()
}

case class DbLong(value: Long) extends DynamoElement {
  def toAttrValue: AttributeValue = AttributeValue.builder().n(value.toString).build()
}

case class DbInt(value: Int) extends DynamoElement {
  def toAttrValue: AttributeValue = AttributeValue.builder().n(value.toString).build()
}

case class DbNestedMap(value: Map[String, DynamoElement]) extends DynamoElement {
  def toAttrValueRec(value: Map[String, DynamoElement], acc: Map[String, AttributeValue]): Map[String, AttributeValue] = {
    value.flatMap { case (k, v) =>
      v match {
        case DbString(_) | DbLong(_) | DbInt(_) => acc.updated(k, v.toAttrValue)
        case DbNestedMap(m) => toAttrValueRec(m, acc)
      }
    }
  }
  val javaMap = toAttrValueRec(value, Map[String, AttributeValue]()).asJava

  def toAttrValue = AttributeValue.builder().m(javaMap).build()
}

