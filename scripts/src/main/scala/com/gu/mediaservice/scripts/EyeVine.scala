package com.gu.mediaservice.scripts

import com.gu.mediaservice.scripts.AlamyCleanUp.{GRIDDOMAIN, GRIDKEY, STAGE}

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}

object EyeVine extends App {
  val GRIDKEY = sys.env.getOrElse("GRIDKEY", throw new RuntimeException("Must set a GRIDKEY env variable"))
  val STAGE = sys.env.getOrElse("STAGE", throw new RuntimeException("Must set a STAGE env variable"))
  val GRIDDOMAIN = if(STAGE == "PROD") "gutools.co.uk" else "test.dev-gutools.co.uk"

  println(s"Running for stage $STAGE with domain $GRIDDOMAIN")

  val gridId = "9b8104b27921381a18fdf3afc6de0043d0577351"

  val leases = s""" [{
                     |    "mediaId": "${gridId}",
                     |    "createdAt": "2026-09-29T14:54:17.301Z",
                     |    "leasedBy": "image-syndication",
                     |    "access": "allow-syndication"
                     |
                     |}]""".stripMargin
  val leasesBody = HttpRequest.BodyPublishers.ofString(leases)

  val client = HttpClient.newHttpClient()
  val request = HttpRequest.newBuilder(new URI(s"https://media-leases.$GRIDDOMAIN/leases/media/$gridId")).headers(
    "X-Gu-Media-Key", GRIDKEY, "Content-Type", "application/json").PUT(leasesBody).build()

  val response = client.send(request, HttpResponse.BodyHandlers.ofString())
  println(response.statusCode())
  println(response.body())

}
