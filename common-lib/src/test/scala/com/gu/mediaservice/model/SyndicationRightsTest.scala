package com.gu.mediaservice.model

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.Json

class SyndicationRightsTest extends FunSpec with Matchers {

  it("should deserialise with all fields") {
    val serialisedRights =
      """
        |{
        |  "published": "2021-1-21T21:21:21.21Z",
        |  "suppliers": [],
        |  "rights": [],
        |  "isInferred": false
        |}
        |""".stripMargin
    val parsedRightsJson = Json.parse(serialisedRights)
    println(parsedRightsJson)
    val rights: SyndicationRights = Json.fromJson[SyndicationRights](parsedRightsJson).get
    rights.isInferred should be (false)
  }

  it("should deserialise with all fields except published") {
    val serialisedRights =
      """
        |{
        |  "suppliers": [],
        |  "rights": [],
        |  "isInferred": false
        |}
        |""".stripMargin
    val parsedRightsJson = Json.parse(serialisedRights)
    println(parsedRightsJson)
    val rights: SyndicationRights = Json.fromJson[SyndicationRights](parsedRightsJson).get
    rights.isInferred should be (false)
  }

  it("should deserialise with all fields except isInferred") {
    val serialisedRights =
      """
        |{
        |  "published": "2021-1-21T21:21:21.21Z",
        |  "suppliers": [],
        |  "rights": []
        |}
        |""".stripMargin
    val parsedRightsJson = Json.parse(serialisedRights)
    println(parsedRightsJson)
    val rights: SyndicationRights = Json.fromJson[SyndicationRights](parsedRightsJson).get
    rights.isInferred should be (false)
  }

}
