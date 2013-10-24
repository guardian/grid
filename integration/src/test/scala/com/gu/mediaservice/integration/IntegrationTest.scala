package com.gu.mediaservice
package integration

import org.scalatest.{Matchers, BeforeAndAfterAll, FunSpec}
import play.api.libs.json.JsString
import play.api.libs.ws.WS

import scalaz.std.AllInstances._
import scalaz.syntax.traverse._

import com.gu.mediaservice.lib.json._

import ImageFixture._
import scala.concurrent.Future

class IntegrationTest extends FunSpec with TestHarness with Matchers with BeforeAndAfterAll {

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

      assert(loaderResponse.status == Accepted)
      imageId

    }

    it ("should become visible in the Media API") {

      retrying("get image") {
        val mediaApiResponse = getImage(imageId)
        assert(mediaApiResponse.status == OK)
      }

    }

    it ("should contain IPTC metadata") {

      val responseMeta = getImage(imageId).json \ "metadata"

      for ((key, value) <- metadata)
        assert(responseMeta \ key == JsString(value))

    }

    lazy val fileUrl = (getImage(imageId).json \ "secure-url").as[String]

    it ("should have a usable URL for the image") {

      val imageResponse = await()(WS.url(fileUrl).get)

      assert(imageResponse.status == OK)

    }
    
    it ("can be added to buckets") {
      
      val bucketsUrl = config.imageEndpoint(imageId) + "/buckets"
      
      val buckets = Seq("my-bucket", "another-bucket")
      
      for (bucket <- buckets)
        await()(WS.url(bucketsUrl).post(bucket))

      retrying("get bucket") {
        val bucketsFromResponse = array(getImage(imageId).json \ "buckets") flatMap (_ traverse string) getOrElse Nil
        buckets.foreach(bucket => bucketsFromResponse should contain (bucket))
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


case class ImageFixture(id: String, metadata: Seq[(String, String)])

object ImageFixture {
  def fixture(id: String, metadata: (String, String)*) = ImageFixture(id, metadata)
}
