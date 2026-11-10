package controllers

import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.model._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import org.scalatest._
import flatspec._
import matchers._

class MediaApiUrlsTest extends AnyFlatSpec with Matchers with MediaApiUrls {

  "media api urls" should
    "identify media API image urls" in {
    isMediaApiImageUri("https://media.api.test.com/images/cb5b8c05b690db2d034457b5461ef32abf29eff8", "https://media.api.test.com") shouldBe true
    isMediaApiImageUri("https://media.api.test.com/images", "https://media.api.test.com") shouldBe false
    isMediaApiImageUri("images/cb5b8c05b690db2d034457b5461ef32abf29eff8", "https://media.api.test.com") shouldBe false
    isMediaApiImageUri("cb5b8c05b690db2d034457b5461ef32abf29eff8", "https://media.api.test.com") shouldBe false
  }

}
