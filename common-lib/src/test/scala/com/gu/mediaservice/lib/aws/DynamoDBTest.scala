package com.gu.mediaservice.lib.aws

import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.gu.mediaservice.model.{ActionData, Collection}
import org.joda.time.DateTime
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.{Format, JsObject, Json}

class DynamoDBTest extends FunSpec with Matchers {

  describe("jsonToValueMap") {
    it ("should convert a simple JsObject to a valueMap") {
      val json = Json.toJson(SimpleDynamoDBObj("this is a string", 100, true, List("list"))).as[JsObject]
      val valueMap = DynamoDB.jsonToValueMap(json)


      // This is the only way to get stuff type safely out of the valueMap
      // It's not a problem as we shoulnd't be doing this anywhere else
      val s: String = valueMap.get("s").asInstanceOf[String]
      val d: BigDecimal = valueMap.get("d").asInstanceOf[java.math.BigDecimal]
      val b: Boolean = valueMap.get("b").asInstanceOf[Boolean]
      val a: List[String] = List(valueMap.get("a").asInstanceOf[java.util.ArrayList[String]].toArray(): _*).asInstanceOf[List[String]]


      s should be ("this is a string")
      d should be (100)
      b should equal(true)
      a should equal(List("list"))
    }

    it ("should convert a nested JsObject to a valueMap") {
      val nestedObj = NestedDynamoDBObj("string", 100, false, SimpleDynamoDBObj("strang", 500, true, List("list")))
      val json = Json.toJson(nestedObj).as[JsObject]
      val valueMap = DynamoDB.jsonToValueMap(json)

      val ss: String = valueMap.get("ss").asInstanceOf[String]
      val dd: BigDecimal = valueMap.get("dd").asInstanceOf[java.math.BigDecimal]
      val bb: Boolean = valueMap.get("bb").asInstanceOf[Boolean]

      val simpleMap = valueMap.get("simple").asInstanceOf[ValueMap]

      val s: String = simpleMap.get("s").asInstanceOf[String]
      val d: BigDecimal = simpleMap.get("d").asInstanceOf[java.math.BigDecimal]
      val b: Boolean = simpleMap.get("b").asInstanceOf[Boolean]
      val a: List[String] = List(simpleMap.get("a").asInstanceOf[java.util.ArrayList[String]].toArray: _*).asInstanceOf[List[String]]


      ss should be ("string")
      dd should be (100)
      bb should equal(false)

      s should be ("strang")
      d should be (500)
      b should equal(true)
      a should equal(List("list"))
    }

    it ("should convert a Collection to ValueMap") {
      val collection = Collection.build(List("g2", "art", "batik"), ActionData("mighty.mouse@guardian.co.uk", DateTime.now))
      val json = Json.toJson(collection).as[JsObject]
      val valueMap = DynamoDB.jsonToValueMap(json)

      val path = List(valueMap.get("path").asInstanceOf[java.util.ArrayList[String]].toArray: _*).asInstanceOf[List[String]]
      val pathId = valueMap.get("pathId").asInstanceOf[String]
      val actionData = valueMap.get("actionData").asInstanceOf[ValueMap]
      val author = actionData.get("author").asInstanceOf[String]

      pathId should be (collection.pathId)
      author should be (collection.actionData.author)
      path should be (collection.path)
    }
  }

}

case class SimpleDynamoDBObj(s: String, d: BigDecimal, b: Boolean, a: List[String])
object SimpleDynamoDBObj {
  implicit def formats: Format[SimpleDynamoDBObj] = Json.format[SimpleDynamoDBObj]
}

case class NestedDynamoDBObj(ss: String, dd: BigDecimal, bb: Boolean, simple: SimpleDynamoDBObj)
object NestedDynamoDBObj {
  implicit def formats: Format[NestedDynamoDBObj] = Json.format[NestedDynamoDBObj]
}
