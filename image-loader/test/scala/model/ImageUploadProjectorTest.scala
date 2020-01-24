package test.model

import java.io.File

import com.gu.mediaservice.lib.imaging.ImageOperations
import lib.DigestedFile
import model.{ImageUploadOpsCfg, ImageUploadProjector}
import org.scalatest.FunSuite
import play.api.libs.json.Json
import test.lib.ResourceHelpers

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration

class ImageUploadProjectorTest extends FunSuite {

  // TODO to be completed

  val testFile = ResourceHelpers.fileAt("getty.jpg")

  private val imageOperations = new ImageOperations("")

  private val config = ImageUploadOpsCfg(
    new File("/tmp"),
    256,
    85d,
    List[String](),
    "img-bucket",
    "thumb-bucket"
  )

  val projector = new ImageUploadProjector(config, imageOperations)

  test("testProjectImage") {

    val fileDigest = DigestedFile(testFile, "id123")
    val uploadedBy = "test"
    val uploadTime = "2020-01-24T17:36:08.456Z"

    val f = projector.projectImage(fileDigest, uploadedBy, uploadTime)

    //    val actual = Await.result(f, Duration.Inf)
    //
    //    val actualJson = Json.toJson(actual)
    //
    //    actualJson

  }

}

