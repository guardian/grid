package model

import java.io.File

import com.gu.mediaservice.lib.imaging.ImageOperations
import lib.DigestedFile
import org.scalatest.FunSuite

import scala.concurrent.ExecutionContext.Implicits.global

class ImageUploadProjectorTest extends FunSuite {

  // TODO to be completed

  private val testFile = new File("image-loader/test/resources/getty.jpg")

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

    val userMetaGiven = Map("test" -> "1")
    val fileDigest = DigestedFile(testFile, "id123")

    val f = projector.projectImage(fileDigest, userMetaGiven)

  }

}

