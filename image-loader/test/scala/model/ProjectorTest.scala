package model

import java.io.File
import java.net.URI
import java.util.{Date, UUID}

import com.amazonaws.services.s3.AmazonS3
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.GridClient
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.RequestLoggingContext
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.LeasesByMedia
import lib.DigestedFile
import org.joda.time.{DateTime, DateTimeZone}
import org.mockito.Mockito.{times, verify, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.mockito.MockitoSugar
import org.scalatest.time.{Millis, Span}
import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json.{JsArray, JsString}
import test.lib.ResourceHelpers

import scala.concurrent.ExecutionContext.Implicits.global
import scala.collection.JavaConverters._
import scala.concurrent.Future

class ProjectorTest extends FreeSpec with Matchers with ScalaFutures with MockitoSugar {

  import ResourceHelpers._

  implicit override val patienceConfig: PatienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))

  private val ctxPath = new File(".").getAbsolutePath

  private val imageOperations = new ImageOperations(ctxPath)

  private val config = ImageUploadOpsCfg(new File("/tmp"), 256, 85d, Nil, "img-bucket", "thumb-bucket")

  private val s3 = mock[AmazonS3]
  private val auth = mock[Authentication]
  private val projector = new Projector(config, s3, imageOperations, ImageProcessor.identity, auth)

  // FIXME temporary ignored as test is not executable in CI/CD machine
  // because graphic lib files like srgb.icc, cmyk.icc are in root directory instead of resources
  // this test is passing when running on local machine
  "projectImage" ignore {

    val testFile = fileAt("getty.jpg")
    val id = "id123"
    val fileDigest = DigestedFile(testFile, id)
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
      id = id,
      uploadTime = new DateTime("2020-01-24T17:36:08.456Z").withZone(DateTimeZone.UTC),
      uploadedBy = "test",
      lastModified = Some(new DateTime("2020-01-24T17:36:08.456Z").withZone(DateTimeZone.UTC)),
      identifiers = Map(),
      uploadInfo = UploadInfo(Some("getty.jpg")),
      source = Asset(new URI("http://img-bucket.s3.amazonaws.com/i/d/1/2/3/" + id),
        Some(12666),
        Some(Jpeg),
        Some(Dimensions(100, 60)), None),
      thumbnail = Some(Asset(new URI("http://thumb-bucket.s3.amazonaws.com/i/d/1/2/3/" + id),
        Some(6397),
        Some(Jpeg),
        Some(Dimensions(256, 154)), None)),
      optimisedPng = None,
      fileMetadata = gettyFileMetadataExpected,
      userMetadata = None,
      metadata = ImageMetadata(
        dateTaken = Some(new DateTime("2015-01-22T00:00:00.000Z").withZone(DateTimeZone.UTC)),
        description = Some("Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images"),
        credit = Some("AFP/Getty Images"),
        creditUri = None,
        byline = Some("CHRISTOF STACHE"),
        bylineTitle = Some("Stringer"),
        title = Some("Austria's Matthias Mayer attends the men"),
        copyright = Some("CHRISTOF STACHE"),
        suppliersReference = Some("-"),
        source = Some("AFP"),
        specialInstructions = None,
        keywords = Nil,
        subLocation = None,
        city = Some("KITZBUEHEL"),
        state = Some("-"),
        country = Some("AUSTRIA"),
        subjects = List("sport"),
        ),
      originalMetadata = ImageMetadata(
        dateTaken = Some(new DateTime("2015-01-22T00:00:00.000Z").withZone(DateTimeZone.UTC)),
        description = Some("Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images"),
        credit = Some("AFP/Getty Images"),
        creditUri = None,
        byline = Some("CHRISTOF STACHE"),
        bylineTitle = Some("Stringer"),
        title = Some("Austria's Matthias Mayer attends the men"),
        copyright = Some("CHRISTOF STACHE"),
        suppliersReference = Some("-"),
        source = Some("AFP"),
        specialInstructions = None,
        keywords = Nil,
        subLocation = None,
        city = Some("KITZBUEHEL"),
        state = Some("-"),
        country = Some("AUSTRIA"),
        subjects = List("sport")),
        usageRights = NoRights,
        originalUsageRights = NoRights,
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
      identifiers = Map.empty,
    )

    implicit val requestLoggingContext: RequestLoggingContext = RequestLoggingContext()

    val gridClient = mock[GridClient]
    when(gridClient.getUsages(id, identity)).thenReturn(Future.successful(Nil))
    when(gridClient.getCrops(id, identity)).thenReturn(Future.successful(Nil))
    when(gridClient.getLeases(id, identity)).thenReturn(Future.successful(LeasesByMedia.empty))

    val actualFuture = projector.projectImage(fileDigest, extractedS3Meta, UUID.randomUUID(), gridClient, identity)
    actualFuture.recoverWith( {case t: Throwable => t.printStackTrace(); throw t})

    whenReady(actualFuture) { actual =>
      actual.id  shouldEqual expected.id
      actual.metadata shouldEqual expected.metadata
      actual.originalMetadata shouldEqual expected.originalMetadata
      actual.usageRights shouldEqual expected.usageRights
      actual.originalUsageRights shouldEqual expected.originalUsageRights
      actual.exports shouldEqual expected.exports
      actual.usages shouldEqual expected.usages
      actual.leases shouldEqual expected.leases
      actual.collections shouldEqual expected.collections
      actual.syndicationRights shouldEqual expected.syndicationRights
      actual shouldEqual expected
    }

    verify(gridClient, times(1)).getLeases(id, identity)
    verify(gridClient, times(1)).getUsages(id, identity)
    verify(gridClient, times(1)).getCrops(id, identity)

  }

  "S3FileExtractedMetadata" - {
    "should extract URL encoded metadata" in {
      val s3Metadata = new ObjectMetadata()
      s3Metadata.setLastModified(new Date(1613388118000L))
      s3Metadata.setUserMetadata(Map(
        "file-name" -> "This%20photo%20was%20taken%20in%20%C5%81%C3%B3d%C5%BA.jpg",
        "uploaded-by" -> "s%C3%A9b.cevey%40theguardian.co.uk",
        "upload-time" -> "2021-02-01T12%3A52%3A34%2B09%3A00",
        "identifier!picdarurn" -> "12*543%5E25"
      ).asJava)

      val result = S3FileExtractedMetadata(s3Metadata)
      result.uploadFileName shouldBe Some("This photo was taken in Łódź.jpg")
      result.uploadedBy shouldBe "séb.cevey@theguardian.co.uk"
      result.uploadTime.toString shouldBe "2021-02-01T03:52:34.000Z"
      result.identifiers.size shouldBe 1
      result.identifiers.get("picdarurn") shouldBe Some("12*543^25")
    }

    "should remap headers with underscores to dashes" in {
      val s3Metadata = new ObjectMetadata()
      s3Metadata.setLastModified(new Date(1613388118000L))
      s3Metadata.setUserMetadata(Map(
        "file_name" -> "filename.jpg",
        "uploaded_by" -> "user",
        "upload_time" -> "2021-02-01T12%3A52%3A34%2B09%3A00",
        "identifier!picdarurn" -> "12*543"
      ).asJava)

      val result = S3FileExtractedMetadata(s3Metadata)
      result.uploadFileName shouldBe Some("filename.jpg")
      result.uploadedBy shouldBe "user"
      result.uploadTime.toString shouldBe "2021-02-01T03:52:34.000Z"
      result.identifiers.size shouldBe 1
      result.identifiers.get("picdarurn") shouldBe Some("12*543")
    }

    "should correctly read in non URL encoded values" in {
      // we have plenty of values in S3 that are not URL encoded
      // and we must be able to read them correctly
      val s3Metadata = new ObjectMetadata()
      s3Metadata.setLastModified(new Date(1613388118000L))
      s3Metadata.setUserMetadata(Map(
        "uploaded_by" -> "user",
        "upload_time" -> "2019-12-11T01:12:10.427Z",
      ).asJava)

      val result = S3FileExtractedMetadata(s3Metadata)
      result.uploadedBy shouldBe "user"
      result.uploadTime.toString shouldBe "2019-12-11T01:12:10.427Z"
    }
  }

}

