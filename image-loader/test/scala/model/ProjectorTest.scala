package model

import java.io.File
import java.net.URI
import java.util.UUID

import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.RequestLoggingContext
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.LeasesByMedia
import lib.DigestedFile
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.concurrent.ScalaFutures
import org.scalatestplus.mockito.MockitoSugar
import org.scalatest.time.{Millis, Span}
import org.scalatest.{FunSuite, Matchers}
import play.api.libs.json.{JsArray, JsString}
import test.lib.ResourceHelpers

import scala.concurrent.ExecutionContext.Implicits.global

class ProjectorTest extends FunSuite with Matchers with ScalaFutures with MockitoSugar {

  import ResourceHelpers.fileAt

  implicit override val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))

  private val ctxPath = new File("image-loader/").getAbsolutePath

  private val imageOperations = new ImageOperations(ctxPath)

  private val config = ImageUploadOpsCfg(new File("/tmp"), 256, 85d, Nil, "img-bucket", "thumb-bucket")

  private val s3 = mock[AmazonS3]
  private val projector = new Projector(config, s3, imageOperations, ImageProcessor.identity)

  // FIXME temporary ignored as test is not executable in CI/CD machine
  // because graphic lib files like srgb.icc, cmyk.icc are in root directory instead of resources
  // this test is passing when running on local machine
  ignore("projectImage") {

    val testFile = fileAt("resources/getty.jpg")
    val fileDigest = DigestedFile(testFile, "id123")
    val uploadedBy = "test"
    val uploadTime = new DateTime("2020-01-24T17:36:08.456Z").withZone(DateTimeZone.UTC)
    val uploadFileName = Some("getty.jpg")

    // expected
    val iptc = Map(
      "By-line Title" -> "Stringer",
      "Country/Primary Location Code" -> "AUT",
      "Country/Primary Location Name" -> "AUSTRIA",
      "Category" -> "S",
      "Copyright Notice" -> "CHRISTOF STACHE",
      "Supplemental Category(s)" -> "SKI",
      "Coded Character Set" -> "UTF-8",
      "Application Record Version" -> "4",
      "Caption/Abstract" -> "Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images",
      "Enveloped Record Version" -> "4",
      "Credit" -> "AFP/Getty Images",
      "Source" -> "AFP",
      "City" -> "KITZBUEHEL",
      "By-line" -> "CHRISTOF STACHE",
      "Urgency" -> "51",
      "Headline" -> "Austria's Matthias Mayer attends the men",
      "Edit Status" -> "AFP",
      "Province/State" -> "-",
      "Object Name" -> "536991815",
      "Caption Writer/Editor" -> "CS/IW",
      "Original Transmission Reference" -> "DV1945213",
      "Date Created" -> "2015-01-22"
    )
    val exif = Map(
      "Image Description" -> "Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images"
    )
    val getty = Map(
      "Call For Image" -> "False",
      "Image Rank" -> "3",
      "Original Filename" -> "43885812_SEA.jpg",
      "Exclusive Coverage" -> "False",
      "Original Create Date Time" -> "0001-01-01T00:00:00.000Z"
    )
    val xmp = Map(
      "GettyImagesGIFT:ImageRank" -> JsString("3"),
      "GettyImagesGIFT:OriginalFilename" -> JsString("43885812_SEA.jpg"),
      "dc:title" -> JsArray(Seq(
        JsString("536991815"),
        JsArray(Seq(JsString("{'xml:lang':'x-default'}"))),
      )),
      "dc:creator" -> JsArray(Seq(JsString("CHRISTOF STACHE"))),
      "photoshop:SupplementalCategories" -> JsArray(Seq(JsString("SKI"))),
      "photoshop:Headline" -> JsString("Austria's Matthias Mayer attends the men"),
      "photoshop:TransmissionReference" -> JsString("-"),
      "photoshop:AuthorsPosition" -> JsString("Stringer"),
      "photoshop:CaptionWriter" -> JsString("CS/IW"),
      "plus:ImageSupplierImageId" -> JsString("DV1945213"),
      "dc:description" -> JsArray(Seq(
        JsString("Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images"),
        JsArray(Seq(JsString("{'xml:lang':'x-default'}"))),
      )),
      "photoshop:City" -> JsString("KITZBUEHEL"),
      "GettyImagesGIFT:ExclusiveCoverage" -> JsString("False"),
      "photoshop:DateCreated" -> JsString("2015-01-22T00:00:00.000Z"),
      "photoshop:Credit" -> JsString("AFP/Getty Images"),
      "dc:Rights" -> JsString("CHRISTOF STACHE"),
      "GettyImagesGIFT:OriginalCreateDateTime" -> JsString("0001-01-01T00:00:00.000Z"),
      "Iptc4xmpCore:CountryCode" -> JsString("AUT"),
      "GettyImagesGIFT:CallForImage" -> JsString("False"),
      "photoshop:Country" -> JsString("AUSTRIA"),
      "photoshop:Source" -> JsString("AFP"),
      "photoshop:Category" -> JsString("S")
    )

    val gettyFileMetadataExpected = FileMetadata(iptc = iptc, exif = exif, xmp = xmp, getty = getty, colourModel = Some("RGB"))

    val expected = Image(
      id = "id123",
      uploadTime = new DateTime("2020-01-24T17:36:08.456Z").withZone(DateTimeZone.UTC),
      uploadedBy = "test",
      lastModified = Some(new DateTime("2020-01-24T17:36:08.456Z").withZone(DateTimeZone.UTC)),
      identifiers = Map(),
      uploadInfo = UploadInfo(Some("getty.jpg")),
      source = Asset(new URI("http://img-bucket.s3.amazonaws.com/i/d/1/2/3/id123"),
        Some(12666),
        Some(Jpeg),
        Some(Dimensions(100, 60)), None),
      thumbnail = Some(Asset(new URI("http://thumb-bucket.s3.amazonaws.com/i/d/1/2/3/id123"),
        Some(6404),
        Some(Jpeg),
        Some(Dimensions(256, 154)), None)),
      optimisedPng = None,
      fileMetadata = gettyFileMetadataExpected,
      userMetadata = None,
      metadata = ImageMetadata(
        Some(new DateTime("2015-01-22T00:00:00.000Z").withZone(DateTimeZone.UTC)),
        Some("Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images"),
        Some("AFP/Getty Images"),
        None, Some("Christof Stache"), Some("Stringer"), None, Some("CHRISTOF STACHE"),
        Some("-"), Some("AFP"), None, Nil, None, Some("Kitzbuehel"), None, Some("Austria"), List("sport")),
      originalMetadata = ImageMetadata(
        Some(new DateTime("2015-01-22T00:00:00.000Z").withZone(DateTimeZone.UTC)),
        Some("Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images"),
        Some("AFP/Getty Images"), None, Some("Christof Stache"), Some("Stringer"),
        None, Some("CHRISTOF STACHE"), Some("-"),
        Some("AFP"), None, Nil, None, Some("Kitzbuehel"), None, Some("Austria"), List("sport")),
      usageRights = Agency("Getty Images", Some("AFP"), None),
      originalUsageRights = Agency("Getty Images", Some("AFP"), None),
      exports = Nil,
      usages = Nil,
      leases = LeasesByMedia.empty,
      collections = Nil,
      syndicationRights = None,
      userMetadataLastModified = None
    )

    val extractedS3Meta = S3FileExtractedMetadata(
      uploadedBy = uploadedBy,
      uploadTime = uploadTime,
      uploadFileName = uploadFileName,
      picdarUrn = None,
    )

    implicit val requestLoggingContext = RequestLoggingContext()

    val actualFuture = projector.projectImage(fileDigest, extractedS3Meta, UUID.randomUUID())

    whenReady(actualFuture) { actual =>
      actual shouldEqual expected
    }
  }

}

