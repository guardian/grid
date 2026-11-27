package com.gu.mediaservice.lib.imaging

import app.photofox.vipsffm.{VBlob, VImage, VipsHelper, VipsOption}
import app.photofox.vipsffm.enums.{VipsBandFormat, VipsIntent, VipsInterpretation}
import com.gu.mediaservice.lib.BrowserViewableImage
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import org.apache.commons.io.FileUtils
import org.scalatest.BeforeAndAfterAll
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Millis, Seconds, Span}

import java.awt.color.{ColorSpace, ICC_Profile}
import java.io.File
import java.lang.foreign.Arena
import java.nio.file.Files
import scala.jdk.CollectionConverters._

class VipsImageOperationsTest extends AnyFunSpec with Matchers with ScalaFutures with BeforeAndAfterAll {

  implicit override val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(10, Seconds), interval = Span(25, Millis))
  implicit val logMarker: LogMarker = MarkerMap()

  private lazy val vipsImageOperations = new VipsImageOperations("cropper")
  private val outputDirectory = Files.createTempDirectory("vips-image-operations-test").toFile

  override protected def afterAll(): Unit = {
    try FileUtils.deleteDirectory(outputDirectory)
    finally super.afterAll()
  }

  describe("thumbnail") {
    it("should write thumbnail to output file") {
      val image = fileAt("IMG_4403.JPG")

      val outputFile = tempFileNamed("thumbnail", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 240, 95, outputFile, None, None, None)
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }

    it("should correct for exif orientation if provided") {
      val image = fileAt("IMG_4445.jpg")

      val outputFile = tempFileNamed("thumbnail-tall", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      // Use a large tall thumbnail to expose out of order read which exceeds the line cache
      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 2800, 95, outputFile, None, None, Some(OrientationMetadata(exifOrientation = Some(6))))
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }

    it("render PNG with alpha correctly") {
      val image = fileAt("with-alpha.png")

      val outputFile = tempFileNamed("thumbnail-png-with-alpha", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 1000, 95, outputFile, None, None, None)
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }

    it("render TIF with alpha correctly") {
      val image = fileAt("with-alpha.tif")

      val outputFile = tempFileNamed("thumbnail-tif-with-alpha", ".jpg")
      val browserViewableImageImage = BrowserViewableImage("an-image-id", image, Tiff, Map.empty, isTransformedFromSource = false)

      val eventualThumbnail = vipsImageOperations.createThumbnail(browserViewableImageImage, 1000, 95, outputFile, None, None, None)
      whenReady(eventualThumbnail) { r =>
        r._1.isFile should be(true)
      }
    }
  }

  describe("crop") {
    it("should output cropped master image to file in chosen format") {
      val image = fileAt("IMG_4403.JPG")

      val eventualMasterCrop = vipsImageOperations.cropImage(image,
        Some(Jpeg),
        Bounds(1000, 600, 2000, 1000),
        99.0,
        tempDirForOutputFiles,
        None,
        None,
        Jpeg,
        isTransformedFromSource = false,
        None
      )

      whenReady(eventualMasterCrop) { r =>
        r.isFile should be(true)
      }
    }

    it("should convert CMYK with no profile to sRGB") {
      val image = fileAt("cmyk.jpg")

      val eventualMasterCrop = vipsImageOperations.cropImage(image,
        Some(Jpeg),
        Bounds(0, 0, 5, 4),
        99.0,
        tempDirForOutputFiles,
        None,
        None,
        Jpeg,
        isTransformedFromSource = false,
        None
      )

      whenReady(eventualMasterCrop) { r =>
        r.isFile should be(true)
      }
    }
  }

  describe("resize") {
    it("should output resized image to file in chosen format") {
      implicit val arena: Arena = Arena.ofConfined
      val fullSizedJpegImage = fileAt("IMG_4403.JPG")

      val eventualResized = vipsImageOperations.resizeImage(fullSizedJpegImage, Some(Jpeg), Dimensions(140, 100), 85, tempDirForOutputFiles, Jpeg)
      whenReady(eventualResized) { resized =>
        arena.close()
        resized.isFile should be(true)
      }
    }

    it("render PNG with alpha correctly") {
      implicit val arena: Arena = Arena.ofShared
      val fullSizedImage = fileAt("with-alpha.png")

      val eventualResized = vipsImageOperations.resizeImage(fullSizedImage, Some(Png), Dimensions(800, 600), 95, outputDirectory, Png)

      whenReady(eventualResized) { resized =>
        arena.close()
        resized.isFile should be(true)
      }
    }
  }

  describe("alpha") {
    it("should return false for RGB for a Jpeg with no alpha") {
      implicit val arena: Arena = Arena.ofShared
      val image =  VImage.newFromFile(arena, fileAt("rgb-wo-profile.jpg").getAbsolutePath)
      val hasAlpha = vipsImageOperations.hasAlpha(image)
      arena.close()
      hasAlpha should be(false)
    }

    it("should return true for PNG with alpha") {
      implicit val arena: Arena = Arena.ofShared
      val image = VImage.newFromFile(arena, fileAt("with-alpha.png").getAbsolutePath)
      val hasAlpha = vipsImageOperations.hasAlpha(image)
      arena.close()
      hasAlpha should be(true)
    }
  }

  describe("identifyColourModel") {
    it("should identify 16-bit greyscale TIFF data") {
      val image = tempFileNamed("greyscale16", ".tif")
      withImage(fileAt("grayscale-wo-profile.jpg")) { source =>
        source.colourspace(VipsInterpretation.INTERPRETATION_GREY16).tiffsave(image.getAbsolutePath)
      }
      vipsImageOperations.identifyColourModel(image, Tiff).futureValue should be(Some("Greyscale"))
    }

    Seq(
      VipsInterpretation.INTERPRETATION_sRGB -> "RGB",
      VipsInterpretation.INTERPRETATION_B_W -> "Greyscale",
      VipsInterpretation.INTERPRETATION_CMYK -> "CMYK",
      VipsInterpretation.INTERPRETATION_LABS -> "LAB"
    ).foreach { case (interpretation, expectedModel) =>
      it(s"should identify $expectedModel TIFF data with alpha") {
        val image = tempFileNamed("alpha-colour-model", ".tif")
        withImage(fileAt("with-alpha.tif")) { source =>
          source.colourspace(interpretation).tiffsave(image.getAbsolutePath)
        }
        vipsImageOperations.identifyColourModel(image, Tiff).futureValue should be(Some(expectedModel))
      }
    }

    it("should return RGB for a JPG image with RGB image data and no embedded profile") {
      val image = fileAt("rgb-wo-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be (Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an RGB embedded profile") {
      val image = fileAt("rgb-with-rgb-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("RGB"))
      }
    }

    it("should return RGB for a PNG image with RGB image data and an embedded profile") {
      val image = fileAt("cs-black-000.png")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Png)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("RGB"))
      }
    }

    it("should return RGB for a JPG image with RGB image data and an incorrect CMYK embedded profile") {
      val image = fileAt("rgb-with-cmyk-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("RGB"))
      }
    }

    it("should return CMYK for a JPG image with CMYK image data") {
      val image = fileAt("cmyk.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("CMYK"))
      }
    }

    it("should return Greyscale for a JPG image with greyscale image data and no embedded profile") {
      val image = fileAt("grayscale-wo-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("Greyscale"))
      }
    }

    it("should return RGB for a PNG image with 16 bit RGB image data") {
      val image = fileAt("schaik.com_pngsuite/basi2c16.png")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Png)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("RGB"))
      }
    }

    it("should return LAB for a TIFF image with LAB16 image data") {
      val image = fileAt("halfdome_LAB16.tif")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Tiff)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("LAB"))
      }
    }

    it("should return CMYK for a JPG image with CMYK image data and an embedded profile") {
      val image = fileAt("CMYK-with-profile.jpg")
      val colourModelFuture = vipsImageOperations.identifyColourModel(image, Jpeg)
      whenReady(colourModelFuture) { colourModel =>
        colourModel should be(Some("CMYK"))
      }
    }
  }

  describe("colour compatibility") {
    it("should convert unprofiled LAB to 8-bit sRGB without changing its colours") {
      val source = fileAt("halfdome_LAB16.tif")
      val (output, mimeType) = vipsImageOperations.transformImage(source, Some(Tiff), outputDirectory).futureValue
      mimeType should be(Png)

      withImage(source) { original =>
        val expected = pixels(original.colourspace(VipsInterpretation.INTERPRETATION_sRGB), 500, 400)
        withImage(output) { converted =>
          assertPixel(converted, expected, x = 500, y = 400)
          assertSrgbOutput(converted)
        }
      }
    }

    it("should preserve LAB crop colours") {
      val source = fileAt("halfdome_LAB16.tif")
      val output = crop(source, Tiff, Bounds(500, 400, 32, 32), Some("LAB"))
      withImage(source) { original =>
        val expected = pixels(original.colourspace(VipsInterpretation.INTERPRETATION_sRGB), 500, 400)
        withImage(output) { converted =>
          assertPixel(converted, expected)
          assertSrgbOutput(converted)
        }
      }
    }

    it("should replace a CMYK profile attached to RGB crop data") {
      val source = fileAt("rgb-with-cmyk-profile.jpg")
      val output = crop(source, Jpeg, Bounds(0, 0, 5, 3), Some("RGB"), Some("CMYK"))
      withImage(source) { original =>
        withImage(output) { converted =>
          assertPixel(converted, pixels(original))
          assertSrgbOutput(converted)
          converted.getFields.asScala should not contain "exif-data"
        }
      }
    }

    Seq(
      ("cmyk.jpg", "CMYK", "cmyk.icc", Bounds(0, 0, 5, 4)),
      ("grayscale-wo-profile.jpg", "Greyscale", "grayscale.icc", Bounds(0, 0, 5, 3))
    ).foreach { case (filename, model, profile, bounds) =>
      it(s"should use the existing $model fallback profile when a crop has no profile") {
        val source = fileAt(filename)
        val output = crop(source, Jpeg, bounds, Some(model))
        withImage(source) { original =>
          val expected = original.iccTransform("cropper/srgb.icc",
            VipsOption.String("input-profile", s"cropper/$profile"),
            VipsOption.Enum("intent", VipsIntent.INTENT_PERCEPTUAL)
          )
          withImage(output) { converted =>
            assertPixel(converted, pixels(expected))
            assertSrgbOutput(converted)
          }
        }
      }
    }

    it("should honour a valid non-sRGB profile and not reapply stale source metadata to its thumbnail") {
      val source = tempFileNamed("linear-rgb", ".tif")
      withArena { arena =>
        val image = VImage.black(arena, 32, 32, VipsOption.Int("bands", 3))
          .linear(java.util.List.of(0.0), java.util.List.of(128.0))
          .cast(VipsBandFormat.FORMAT_UCHAR)
          .copy(VipsOption.Enum("interpretation", VipsInterpretation.INTERPRETATION_sRGB))
        image.set("icc-profile-data", VBlob.newFromBytes(arena, ICC_Profile.getInstance(ColorSpace.CS_LINEAR_RGB).getData))
        image.tiffsave(source.getAbsolutePath)
      }
      val (output, mimeType) = vipsImageOperations.transformImage(source, Some(Tiff), outputDirectory).futureValue
      withImage(output) { converted =>
        assertPixel(converted, Seq(188.0, 188.0, 188.0), tolerance = 3.0)
        assertSrgbOutput(converted)
      }

      Seq((source, Tiff, false), (output, mimeType, true)).foreach { case (file, mime, transformed) =>
        val thumbnail = tempFileNamed("profiled-thumbnail", ".jpg")
        val browserImage = BrowserViewableImage("linear-rgb", file, mime, Map.empty, isTransformedFromSource = transformed)
        vipsImageOperations.createThumbnail(browserImage, 32, 100, thumbnail, Some("CMYK"), Some("CMYK"), None).futureValue
        withImage(thumbnail) { converted =>
          assertPixel(converted, Seq(188.0, 188.0, 188.0), tolerance = 4.0)
          assertSrgbOutput(converted)
        }
      }
    }

    it("should preserve unprofiled LAB thumbnail colours") {
      val source = fileAt("halfdome_LAB16.tif")
      val thumbnail = tempFileNamed("lab-thumbnail", ".jpg")
      val browserImage = BrowserViewableImage("lab", source, Tiff, Map.empty, isTransformedFromSource = false)
      vipsImageOperations.createThumbnail(browserImage, 1299, 100, thumbnail, None, Some("LAB"), None).futureValue
      withImage(source) { original =>
        val expected = pixels(original.colourspace(VipsInterpretation.INTERPRETATION_sRGB), 500, 400)
        withImage(thumbnail) { converted =>
          assertPixel(converted, expected, x = 500, y = 400, tolerance = 5.0)
          assertSrgbOutput(converted)
        }
      }
    }

    it("should render RGB thumbnails with an incorrect CMYK profile") {
      val source = fileAt("rgb-with-cmyk-profile.jpg")
      val thumbnail = tempFileNamed("mismatched-profile-thumbnail", ".jpg")
      val browserImage = BrowserViewableImage("mismatched-profile", source, Jpeg, Map.empty, isTransformedFromSource = false)
      vipsImageOperations.createThumbnail(browserImage, 5, 100, thumbnail, Some("CMYK"), Some("RGB"), None).futureValue
      withImage(source) { original =>
        withImage(thumbnail) { converted =>
          assertPixel(converted, pixels(original), tolerance = 5.0)
          assertSrgbOutput(converted)
        }
      }
    }

    it("should use only the composite image of a layered TIFF and retain its alpha") {
      val source = fileAt("tiff_8bpc_layered_withTransparency.tif")
      vipsImageOperations.identifyColourModel(source, Tiff).futureValue should be(Some("RGB"))
      val (output, _) = vipsImageOperations.transformImage(source, Some(Tiff), outputDirectory).futureValue
      val cropped = crop(source, Tiff, Bounds(50, 30, 32, 32), Some("RGB"))
      withImage(source) { original =>
        withImage(output) { converted =>
          converted.getWidth should be(200)
          converted.getHeight should be(133)
          converted.hasAlpha should be(true)
          assertPixel(converted, pixels(original, 100, 60), x = 100, y = 60)
          assertSrgbOutput(converted)
        }
        withImage(cropped) { converted =>
          converted.getWidth should be(32)
          converted.getHeight should be(32)
          assertPixel(converted, pixels(original, 50, 30))
        }
      }
    }

    it("should retain PNG crop alpha but flatten transparent thumbnails onto the existing background") {
      val source = fileAt("with-alpha.png")
      val output = crop(source, Png, Bounds(0, 0, 32, 32), Some("RGB"))
      withImage(source) { original =>
        withImage(output) { converted =>
          converted.hasAlpha should be(true)
          pixels(converted).last should be(pixels(original).last)
        }
      }

      val transparent = tempFileNamed("transparent", ".png")
      withArena { arena =>
        VImage.black(arena, 32, 32, VipsOption.Int("bands", 4))
          .copy(VipsOption.Enum("interpretation", VipsInterpretation.INTERPRETATION_sRGB))
          .pngsave(transparent.getAbsolutePath)
      }
      val thumbnail = tempFileNamed("transparent-thumbnail", ".jpg")
      val browserImage = BrowserViewableImage("transparent", transparent, Png, Map.empty, isTransformedFromSource = false)
      vipsImageOperations.createThumbnail(browserImage, 32, 100, thumbnail, None, Some("RGB"), None).futureValue
      withImage(thumbnail) { converted =>
        converted.hasAlpha should be(false)
        assertPixel(converted, Seq(51.0, 51.0, 51.0), tolerance = 1.0)
      }
    }
  }

  describe("dimensions") {
    it("should return dimensions of horizontal image") {
      val inputFile = fileAt("exif-orientated-no-rotation.jpg")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dims =>
        dims.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should return uncorrected dimensions for exif oriented images") {
      val inputFile = fileAt("exif-orientated.jpg")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dims =>
        dims.get shouldBe new Dimensions(3456, 2304)
      }
    }

    it("should read the correct dimensions for a tiff image") {
      val inputFile = fileAt("flower.tif")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt should be(Symbol("defined"))
        dimOpt.get.width should be(73)
        dimOpt.get.height should be(43)
      }
    }

    it("should read the correct dimensions for a png image") {
      val inputFile = fileAt("schaik.com_pngsuite/basn0g08.png")
      val dimsFuture = vipsImageOperations.dimensions(inputFile)
      whenReady(dimsFuture) { dimOpt =>
        dimOpt should be(Symbol("defined"))
        dimOpt.get.width should be(32)
        dimOpt.get.height should be(32)
      }
    }
  }

  describe("orientation") {
    it("should capture exif orientation tag from JPG images") {
      val image = fileAt("exif-orientated.jpg")
      val orientationFuture = vipsImageOperations.orientation(image)
      whenReady(orientationFuture) { orientationOpt =>
        orientationOpt should be(defined)
        orientationOpt.get.exifOrientation should be(Some(6))
      }
    }

    it("should ignore 0 degree exif orientation tag as it has no material effect") {
      val image = fileAt("exif-orientated-no-rotation.jpg")
      val orientationFuture = vipsImageOperations.orientation(image)
      whenReady(orientationFuture) { orientationOpt =>
        orientationOpt should be(None)
      }
    }
  }

  describe("graphic detection") {
    it("should return not graphic for true colour jpeg") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("exif-orientated-no-rotation.jpg").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(false)
      arena.close()
    }

    it("should return is graphic for depth 2 tiff") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("flower.tif").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(true)
      arena.close()
    }

    it("should return not graphic for depth 4 png with alpha") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("schaik.com_pngsuite/tbbn0g04.png").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(true)
      arena.close()
    }

    it("should return is graphic for depth 8 indexed png") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("schaik.com_pngsuite/basn3p08.png").getAbsolutePath)
      vipsImageOperations.isGraphic(image)(arena) should be(true)
      arena.close()
    }

  }

  describe("saveImageToFile") {
    it("should quantise even if source image is 16bit") {
      val arena = Arena.ofConfined
      val image = VImage.newFromFile(arena, fileAt("schaik.com_pngsuite/basi2c16.png").getAbsolutePath)
      val outputFile = tempFileNamed("quantised-from-16bit-input", ".png")

      vipsImageOperations.saveImageToFile(image, Png, 99, outputFile, quantise = true)

      arena.close()
    }
  }

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }

  private def tempDirForOutputFiles: File = {
    outputDirectory
  }

  private def tempFileNamed(filename: String, suffix: String): File = {
    File.createTempFile(filename, suffix, outputDirectory)
  }

  private def withArena[A](f: Arena => A): A = {
    val arena = Arena.ofConfined()
    try f(arena)
    finally arena.close()
  }

  private def withImage[A](file: File)(f: VImage => A): A =
    withArena(arena => f(VImage.newFromFile(arena, file.getAbsolutePath)))

  private def pixels(image: VImage, x: Int = 0, y: Int = 0): Seq[Double] =
    image.getpoint(x, y).asScala.toSeq.map(_.doubleValue())

  private def assertPixel(image: VImage, expected: Seq[Double], x: Int = 0, y: Int = 0, tolerance: Double = 2.0): Unit = {
    val actual = pixels(image, x, y)
    actual.size should be(expected.size)
    actual.zip(expected).foreach { case (value, reference) =>
      value should be(reference +- tolerance)
    }
  }

  private def assertSrgbOutput(image: VImage): Unit = {
    VipsHelper.image_get_interpretation(image.getUnsafeStructAddress) should be(VipsInterpretation.INTERPRETATION_sRGB.getRawValue)
    VipsHelper.image_get_format(image.getUnsafeStructAddress) should be(VipsBandFormat.FORMAT_UCHAR.getRawValue)
    Option(image.getBlob("icc-profile-data")) should be(defined)
  }

  private def crop(source: File, mimeType: MimeType, bounds: Bounds, model: Option[String], profile: Option[String] = None): File =
    vipsImageOperations.cropImage(source, Some(mimeType), bounds, 100, outputDirectory,
      profile, model, Png, isTransformedFromSource = false, None).futureValue

}
