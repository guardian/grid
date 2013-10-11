package com.gu.mediaservice
package integration

import org.scalatest.{BeforeAndAfterAll, FunSpec}
import play.api.libs.json.JsString
import play.api.libs.ws.WS

import ImageFixture._

class IntegrationTest extends FunSpec with TestHarness with BeforeAndAfterAll {

  override def afterAll() {
    deleteIndex
  }

  val images = Seq(
    fixture("honeybee.jpg", "credit" -> "AFP/Getty Images", "byline" -> "THOMAS KIENZLE"),
    fixture("gallery.jpg", "credit" -> "AFP/Getty Images", "byline" -> "GERARD JULIEN")
  )

  for (image <- images) {
    describe (s"An image submitted to the loader (${image.id})") {
      it should behave like imageLoaderBehaviour(image)
    }
  }

  def imageLoaderBehaviour(image: ImageFixture) {

    val ImageFixture(filename, metadata) = image

    lazy val loaderResponse = loadImage(resourceAsFile(s"/images/$filename"))
    lazy val imageId = (loaderResponse.json \ "id").as[String]

    it ("should be assigned an identifier") {

      assert(loaderResponse.status == 202)
      imageId

    }

    it ("should become visible in the Media API") {

      retrying("get image") {
        val mediaApiResponse = getImage(imageId)
        assert(mediaApiResponse.status == 200)
      }

    }

    it ("should contain IPTC metadata") {

      val responseMeta = getImage(imageId).json \ "metadata"

      for ((key, value) <- metadata)
        assert(responseMeta \ key == JsString(value))

    }

    it ("should have a usable URL for the image") {

      val url = (getImage(imageId).json \ "secureUrl").as[String]

      val imageResponse = await()(WS.url(url).get)

      assert(imageResponse.status == 200)

    }

    it ("can be deleted") {

      val deleteResponse = deleteImage(imageId)
      assert(deleteResponse.status == 202)

      retrying("delete image") {
        val mediaApiResponse = getImage(imageId)
        assert(mediaApiResponse.status == 404)
      }

    }
  }
}


case class ImageFixture(id: String, metadata: Seq[(String, String)])

object ImageFixture {
  def fixture(id: String, metadata: (String, String)*) = ImageFixture(id, metadata)
}
