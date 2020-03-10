package com.gu.mediaservice

import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.scalatest.{FlatSpec, Matchers}

class GridClientTest extends FlatSpec with Matchers {

  it should "override image metadata with user edits" in {
    val client = GridClient(1)
    val result = client.getErrorMessagesFromResponse()

    val metadataExpected = ImageMetadata(
      dateTaken = Some(new DateTime("2014-01-01T00:00:00.000Z")),
      title = Some(s"test title edits"),
      description = Some("test description edits"),
      credit = None,
      keywords = List("a", "b", "cs")
    )

    actual.metadata shouldEqual metadataExpected
    actual.usageRights shouldEqual editedUsageRights
  }

}
