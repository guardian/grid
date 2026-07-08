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

case class DbNestedMap(value: Map[String, Int]) extends DynamoElement {
  def toAttrValue: AttributeValue = {
    val javaMap = value.map { case (k, v) =>
      k -> AttributeValue.builder().n(v.toString).build()
    }.asJava
    AttributeValue.builder().m(javaMap).build()
  }
}

