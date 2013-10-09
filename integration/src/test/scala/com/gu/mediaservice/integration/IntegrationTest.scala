package com.gu.mediaservice
package integration

import org.scalatest.FunSpec
import play.api.libs.json.JsString


class IntegrationTest extends FunSpec with TestHarness {

  val imageId = "honeybee.jpg"

  describe("An image posted to the loader") {

    val loaderResponse = loadImage(imageId, resourceAsFile(s"/images/$imageId"))
    assert(loaderResponse.status == 204)

    it ("should become visible in the Media API") {

      retrying("get image") {
        val mediaApiResponse = getImage(imageId)
        assert(mediaApiResponse.status == 200)
      }

    }

    it ("should contain IPTC metadata") {

      val metadata = getImage(imageId).json \ "metadata"

      assert(metadata \ "credit" == JsString("AFP/Getty Images"))
      assert(metadata \ "byline" == JsString("THOMAS KIENZLE"))

    }

    deleteIndex

  }

}
