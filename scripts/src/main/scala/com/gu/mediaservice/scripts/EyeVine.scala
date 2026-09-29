package com.gu.mediaservice.scripts

import com.gu.mediaservice.scripts.AlamyCleanUp.{GRIDDOMAIN, GRIDKEY, STAGE}

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}

object EyeVine extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

  val gridId = "ba4f7fcd346f6d6705fc37c3585fe3f32dc8f2ee"

  val leases = s""" [{
                     |    "mediaId": "${gridId}",
                     |    "createdAt": "2026-09-29T14:54:17.301Z",
                     |    "leasedBy": "image-syndication",
                     |    "access": "allow-syndication"
                     |
                     |}]""".stripMargin
  val leasesBody = HttpRequest.BodyPublishers.ofString(leases)

  val rights = """{
                 |  "data": {
                 |    "suppliers": [
                 |      {
                 |        "supplierName": "TEST SUPPLIER",
                 |        "supplierId": "DO NOT SYNDICATE",
                 |        "prAgreement": true
                 |      }
                 |    ],
                 |    "rights": [
                 |      {
                 |        "rightCode": "LICENSINGNONSUBSALES",
                 |        "acquired": true,
                 |        "properties": [
                 |          {
                 |            "propertyCode": "TERM",
                 |            "expiresOn": "1980-07-31T00:00:00.000+00:00",
                 |            "value": "THESE ARE IGNORED"
                 |          }
                 |        ]
                 |      }
                 |    ],
                 |    "published": "2022-01-27T00:10:00.000+00:00",
                 |    "isInferred": false
                 |  }
                 |}""".stripMargin

  val rightsBody = HttpRequest.BodyPublishers.ofString(rights)

  val client = HttpClient.newHttpClient()

  val rightsRequest = HttpRequest.newBuilder(new URI(s"https://media-metadata.$GRIDDOMAIN/metadata/$gridId/syndication")).headers(
    "X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").PUT(rightsBody).build()

  val rightsResponse = client.send(rightsRequest, HttpResponse.BodyHandlers.ofString())

  println(s"Rights response: ${rightsResponse.statusCode()}")
  println(rightsResponse.body())

  val leaseRequest = HttpRequest.newBuilder(new URI(s"https://media-leases.$GRIDDOMAIN/leases/media/$gridId")).headers(
    "X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").PUT(leasesBody).build()

  val leaseResponse = client.send(leaseRequest, HttpResponse.BodyHandlers.ofString())


  println(s"Leases response: ${leaseResponse.statusCode()}")
  println(leaseResponse.body())

}
