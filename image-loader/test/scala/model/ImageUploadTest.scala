package scala.model

import java.io.File
import java.net.URI
import java.util.UUID

import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.RequestLoggingContext
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.LeasesByMedia
import lib.DigestedFile
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.mockito.MockitoSugar
import org.scalatest.time.{Millis, Span}
import org.scalatest.{FunSuite, Matchers}
import play.api.libs.json.{JsArray, JsString}
import test.lib.ResourceHelpers

class ImageUploadTest extends FunSuite with Matchers with ScalaFutures with MockitoSugar {
  test("do something") {
    fail("failure you are, says Yoda")
  }
}

