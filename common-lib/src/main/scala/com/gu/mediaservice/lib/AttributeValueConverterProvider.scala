package com.gu.mediaservice.lib

import software.amazon.awssdk.enhanced.dynamodb.{AttributeConverter, AttributeConverterProvider, AttributeValueType, EnhancedType}
import software.amazon.awssdk.services.dynamodb.model.AttributeValue

object AttributeValueConverterProvider extends AttributeConverterProvider {
  private val converter = new AttributeConverter[AttributeValue] {
    override def transformFrom(input: AttributeValue): AttributeValue = input
    override def transformTo(input: AttributeValue): AttributeValue = input
    override def attributeValueType(): AttributeValueType = AttributeValueType.M
    override def `type`(): EnhancedType[AttributeValue] = EnhancedType.of(classOf[AttributeValue])
  }

  override def converterFor[T](enhancedType: EnhancedType[T]): AttributeConverter[T] = {
    if (enhancedType.rawClass() == classOf[AttributeValue]) converter.asInstanceOf[AttributeConverter[T]]
    else null
  }
}
