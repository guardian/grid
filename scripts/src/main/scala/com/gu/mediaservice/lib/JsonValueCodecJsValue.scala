package com.gu.mediaservice.lib

import com.github.plokhotnyuk.jsoniter_scala.core.{JsonReader, JsonValueCodec, JsonWriter}
import _root_.play.api.libs.json.{JsArray, JsBoolean, JsFalse, JsNull, JsNumber, JsObject, JsString, JsTrue, JsValue}

import scala.collection.IndexedSeq

object JsonValueCodecJsValue {

  implicit def jsValueCodec: JsonValueCodec[JsValue] = {
    new JsonValueCodec[JsValue] {

      /**
        * The implementation was borrowed from: https://github.com/plokhotnyuk/jsoniter-scala/blob/e80d51019b39efacff9e695de97dce0c23ae9135/jsoniter-scala-benchmark/src/main/scala/io/circe/CirceJsoniter.scala
        * and adapted to meet PlayJson criteria.
        */
      def decodeValue(in: JsonReader, default: JsValue): JsValue = {
        val b = in.nextToken()
        if (b == 'n') in.readNullOrError(default, "expected `null` value")
        else if (b == '"') {
          in.rollbackToken()
          JsString(in.readString(null))
        } else if (b == 'f' || b == 't') {
          in.rollbackToken()
          if (in.readBoolean()) JsTrue else JsFalse
        } else if ((b >= '0' && b <= '9') || b == '-') {
          in.rollbackToken()
          val bigDecimal = in.readBigDecimal(null)
          JsNumber(bigDecimal)
        } else if (b == '[') {
          val array: IndexedSeq[JsValue] =
            if (in.isNextToken(']')) new Array[JsValue](0)
            else {
              in.rollbackToken()
              var i = 0
              var arr = new Array[JsValue](4)
              do {
                if (i == arr.length) arr = java.util.Arrays.copyOf(arr, i << 1)
                arr(i) = decodeValue(in, default)
                i += 1
              } while (in.isNextToken(','))

              if (in.isCurrentToken(']'))
                if (i == arr.length) arr else java.util.Arrays.copyOf(arr, i)
              else in.arrayEndOrCommaError()
            }
          JsArray(array)
        } else if (b == '{') {
          /*
           * Because of DoS vulnerability in Scala 2.12 HashMap https://github.com/scala/bug/issues/11203
           * we use a Java LinkedHashMap because it better handles hash code collisions for Comparable keys.
           */
          val kvs =
            if (in.isNextToken('}')) new java.util.LinkedHashMap[String, JsValue]()
            else {
              val underlying = new java.util.LinkedHashMap[String, JsValue]()
              in.rollbackToken()
              do {
                underlying.put(in.readKeyAsString(), decodeValue(in, default))
              } while (in.isNextToken(','))

              if (!in.isCurrentToken('}'))
                in.objectEndOrCommaError()

              underlying
            }
          import scala.collection.JavaConverters._
          JsObject(kvs.asScala)
        } else {
          in.decodeError("expected JSON value")
        }
      }

      def encodeValue(jsValue: JsValue, out: JsonWriter): Unit = {
        jsValue match {
          case JsBoolean(b) =>
            out.writeVal(b)
          case JsString(value) =>
            out.writeVal(value)
          case JsNumber(value) =>
            out.writeVal(value)
          case JsArray(items) =>
            out.writeArrayStart()
            items.foreach(encodeValue(_, out))
            out.writeArrayEnd()
          case JsObject(kvs) =>
            out.writeObjectStart()
            kvs.foreach {
              case (k, v) =>
                out.writeKey(k)
                encodeValue(v, out)
            }
            out.writeObjectEnd()
          case JsNull =>
            out.writeNull()
        }
      }

      val nullValue: JsValue = JsNull
    }
  }

}
