package com.gu.thrall.clients.elasticsearchtests

import org.scalatest.concurrent.ScalaFutures
import org.scalatest.concurrent.ScalaFutures._
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{FreeSpec, Matchers}

class ElasticSearchScriptsTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  implicit val patienceConfig: ScalaFutures.PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(50, Millis))

  // TODO decide if we actually will need this functionality at all
  // Might implement it anyway so that we have a proof of concept :)

//  "talk scripts to local es" - {
//
//    val indexName = "scripts"
//    val es = new ElasticSearch("localhost", 9200, "http", indexName)
//
//    "store a script" in {
//      whenReady(es.storeScript("overwrite-usage-field",
//        s"""{
//           |  "script": {
//           |    "lang": "painless",
//           |    "source": "ctx._source.usage = params.usage"
//           |  }
//           |}
//         """.stripMargin)) {
//        result => result shouldBe Right("Script stored")
//      }
//    }
//
//    //    "fail to store a script" in {
    //      whenReady(es.storeScript("bad-script",
    //        s""" {
    //           |      "script": {
    //           |        "lang": "painless",
    //           |        "source": "this text is not valid painless"
    //           |      }
    //           |    }
    //           |
    //         """.stripMargin)) {
    //        result => result shouldBe "Script stored"
    //      }
    //    }
    //
    //    "fail to invoke a script" in {
    //      whenReady(es.invokeScript("bad-script")) {
    //        result => result shouldBe "banana"
    //      }
    //    }
    //
    //    "invoke a script" in {
    //      whenReady(es.invokeScript("good-script")) {
    //        result => result shouldBe "banana"
    //      }
    //    }
    //
//  }

}


