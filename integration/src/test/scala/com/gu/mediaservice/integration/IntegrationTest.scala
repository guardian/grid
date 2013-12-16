package com.gu.mediaservice
package integration

import org.scalatest.{Matchers, BeforeAndAfterAll, FunSpec}
import play.api.libs.json.{JsValue, JsString}
import play.api.libs.ws.WS

import scalaz.std.AllInstances._
import scalaz.syntax.traverse._

import com.gu.mediaservice.lib.json._


class IntegrationTest extends FunSpec with TestHarness with Matchers with BeforeAndAfterAll {

  val config = devConfig getOrElse testStackConfig

  val images = Seq(
    ImageFixture("honeybee.jpg", Map("credit" -> "AFP/Getty Images", "byline" -> "THOMAS KIENZLE")),
    ImageFixture("gallery.jpg", Map("credit" -> "AFP/Getty Images", "byline" -> "GERARD JULIEN"))
  )

  for (image <- images) {
    describe (s"An image submitted to the loader (${image.id})") {
      it should behave like imageLoaderBehaviour(image)
    }
  }

  def getImageData(imageId: String): JsValue = getImage(imageId).json \ "data"

  def imageLoaderBehaviour(image: ImageFixture) {

    val ImageFixture(filename, metadata) = image
    val byline = metadata("byline")

    lazy val loaderResponse = loadImage(resourceAsFile(s"/images/$filename"))
    lazy val imageId = (loaderResponse.json \ "id").as[String]

    it ("should be assigned an identifier") {

      assert(loaderResponse.status == Accepted)
      imageId

    }


    it ("should become searchable in the Media API") {

      retrying("search image") {
        val searchResponse = searchImages(byline)
        assert {
          array(searchResponse.json \ "data").get.exists { item =>
            string(item \ "data" \ "id") == Some(imageId)
          }
        }
      }

    }

    it ("should become retrievable in the Media API") {

      retrying("get image") {
        val mediaApiResponse = getImage(imageId)
        assert(mediaApiResponse.status == OK)
      }

    }

    it ("should contain IPTC metadata") {

      val responseMeta = getImageData(imageId) \ "metadata"

      for ((key, value) <- metadata)
        assert(responseMeta \ key == JsString(value))

    }

    lazy val fileUrl = (getImageData(imageId) \ "secureUrl").as[String]

    it ("should have a usable URL for the image") {

      val imageResponse = await()(WS.url(fileUrl).get)

      assert(imageResponse.status == OK)

    }

    lazy val thumbUrl = (getImageData(imageId) \ "thumbnail" \ "secureUrl").as[String]

    it ("should have a usable URL for the thumbnail") {

      val imageResponse = await()(WS.url(thumbUrl).get)

      assert(imageResponse.status == OK)

    }

    lazy val addToBucketUrl = config.imageEndpoint(imageId) + "/add-to-bucket"
    lazy val removeFromBucketUrl = config.imageEndpoint(imageId) + "/remove-from-bucket"

    def getBuckets = array(getImageData(imageId) \ "buckets") flatMap (_ traverse string) getOrElse Nil

    it ("can be added to buckets") {

      val buckets = Seq("my-bucket", "another-bucket")

      for (bucket <- buckets)
        await()(WS.url(addToBucketUrl).withHeaders(apiKeyHeader).post(bucket))

      retrying("add to bucket") {
        val updatedBuckets = getBuckets
        buckets.foreach(bucket => updatedBuckets should contain (bucket))
      }

    }

    it ("can be removed from a bucket") {

      await()(WS.url(removeFromBucketUrl).withHeaders(apiKeyHeader).post("my-bucket"))

      retrying("remove from bucket") {
        getBuckets should not contain "my-bucket"
      }
    }

    it ("can be deleted") {

      val deleteResponse = deleteImage(imageId)
      assert(deleteResponse.status == Accepted)

      retrying("delete image") {
        val mediaApiResponse = getImage(imageId)
        assert(mediaApiResponse.status == NotFound)

        val imageResponse = await()(WS.url(fileUrl).get)
        // S3 doesn't seem to give a 404 on a signed URL
        assert(imageResponse.status == Forbidden)
      }

    }
  }
}


case class ImageFixture(id: String, metadata: Map[String, String])
