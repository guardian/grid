package test.lib.imaging

import java.io.File

import org.scalatest.time.{Millis, Span}
import org.scalatest.{FunSpec, Matchers}
import org.scalatest.concurrent.ScalaFutures

import lib.imaging.ColorModelDetection
import com.gu.mediaservice.model.ColorModel


class ColorModelDetectionTest extends FunSpec with Matchers with ScalaFutures {
  import test.lib.ResourceHelpers._

  implicit override val patienceConfig = PatienceConfig(timeout = Span(500, Millis), interval = Span(25, Millis))

  //TODO: Fix CI environment so we can actually run these tests
//  it("should read the correct color model for a JPG images") {
//    val images = Map(
//      "cmyk_no_profile.jpg" -> "CMYK",
//      "cmyk_swop_profile.jpg" -> "CMYK",
//      "grey_no_profile.jpg" -> "Gray",
//      "grey_dotgain_profile.jpg" -> "Gray",
//      "rgb_no_profile.jpg" -> "sRGB",
//      "rgb_srgb_profile.jpg" -> "sRGB"
//    )
//
//    images.map { case (resourcePath, colorspace) => {
//      val fullPath = fileAt(s"colormodel_samples/$resourcePath").getAbsolutePath()
//      ColorModelDetection.getColorModel(fullPath) should be (Some(ColorModel(colorspace)))
//    }}
//  }
}
