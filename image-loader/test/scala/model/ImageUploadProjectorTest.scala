package test.model

import java.io.File

import com.gu.mediaservice.lib.imaging.ImageOperations
import lib.DigestedFile
import model.{ImageUploadOpsCfg, ImageUploadProjector}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.{FunSuite, Matchers}
import test.lib.ResourceHelpers

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration

class ImageUploadProjectorTest extends FunSuite with Matchers with ScalaFutures {

  // TODO to be completed

  val ctxPath = "image-loader"

  private val imageOperations = new ImageOperations("image-loader")

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

    val testFile = ResourceHelpers.fileAt("getty.jpg")

    val fileDigest = DigestedFile(testFile, "id123")
    val uploadedBy = "test"
    val uploadTime = "2020-01-24T17:36:08.456Z"

    val f = projector.projectImage(fileDigest, uploadedBy, uploadTime)

    val actual = Await.result(f, Duration.Inf)

    //    val expected = Image("id123",
    //      new DateTime("2020-01-24T17:36:08.456Z"),
    //      "test",
    //      Some("2020-01-24T17:36:08.456Z"),
    //      Map(),
    //      UploadInfo(None),
    //      Asset(new URI("http://img-bucket.s3.amazonaws.com/i/d/1/2/3/id123"),Some(12666),
    //        Some("image/jpeg"),
    //        Some(Dimensions(100,60)),None),
    //      Some(Asset(new URI("http://thumb-bucket.s3.amazonaws.com/i/d/1/2/3/id123"),
    //        Some(12666),Some("image/jpeg"),
    //        Some(Dimensions(256,154)),None)),
    //      None,
    //      FileMetadata(
    //        Map(By-line Title"" -> "Stringer,
    //          Country/Primary Location Name"" -> "AUSTRIA,
    //          Category"" -> "S,
    //          Country/Primary Location Code"" -> "AUT,
    //          Copyright Notice"" -> "CHRISTOF STACHE,
    //          Supplemental Category(s)" -> "SKI, Coded Character Set"" -> "UTF-8, Application Record Version" -> "4, Caption/Abstract" -> "Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images, Enveloped Record Version" -> "4, Credit" -> "AFP/Getty Images, Source" -> "AFP, City" -> "KITZBUEHEL, By-line" -> "CHRISTOF STACHE, Urgency" -> "51, Headline" -> "Austria's Matthias Mayer attends the men, Edit Status" -> "AFP, Province/State" -> ""-, Object Name"" -> "536991815, Caption Writer/Editor" -> "CS/IW, Original Transmission Reference" -> "DV1945213, Date Created" -> "2015-01-22)
    //    ,Map(Image Description"" -> "Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images),Map(),Map(GettyImagesGIFT:ImageRank" -> "3", GettyImagesGIFT:OriginalFilename"" -> "43885812_SEA.jpg", dc:description"" -> "["Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images",["{'xml:lang':'x-default'}"]], photoshop:Headline" -> ""Austria's Matthias Mayer attends the men", photoshop:TransmissionReference" -> "-", photoshop:AuthorsPosition"" -> "Stringer", photoshop:CaptionWriter"" -> "CS/IW", photoshop:SupplementalCategories"" -> "["SKI"], plus:ImageSupplierImageId" -> ""DV1945213", photoshop:City" -> "KITZBUEHEL", GettyImagesGIFT:ExclusiveCoverage"" -> "False", photoshop:DateCreated"" -> "2015-01-22T00:00:00.000Z", photoshop:Credit"" -> "AFP/Getty Images", dc:Rights"" -> "CHRISTOF STACHE", GettyImagesGIFT:OriginalCreateDateTime"" -> "0001-01-01T00:00:00.000Z", dc:creator"" -> "["CHRISTOF STACHE"], dc:title" -> "["536991815",["{'xml:lang':'x-default'}"]], Iptc4xmpCore:CountryCode" -> "AUT", GettyImagesGIFT:CallForImage"" -> "False", photoshop:Country"" -> "AUSTRIA", photoshop:Source"" -> "AFP", photoshop:Category"" -> "S"),Map(),Map(Call For Image"" -> "False, Image Rank" -> "3, Original Filename" -> "43885812_SEA.jpg, Exclusive Coverage" -> "False, Original Create Date Time" -> "0001-01-01T00:00:00.000Z),Some(RGB),Map()),None,ImageMetadata(Some(2015-01-22T00:00:00.000Z),Some(Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images),Some(AFP/Getty Images),None,Some(Christof Stache),Some(Stringer),None,Some(CHRISTOF STACHE),Some(CHRISTOF STACHE),Some(-),Some(AFP),None,List(),None,Some(Kitzbuehel),None,Some(Austria),List(sport)),ImageMetadata(Some(2015-01-22T00:00:00.000Z),Some(Austria's Matthias Mayer attends the men's downhill training of the FIS Alpine Skiing World Cup in Kitzbuehel, Austria, on January 22, 2015.       AFP PHOTO / CHRISTOF STACHECHRISTOF STACHE/AFP/Getty Images),
    //      Some(AFP/Getty Images),None,Some(Christof Stache),Some(Stringer),None,Some(CHRISTOF STACHE),Some(CHRISTOF STACHE),Some(-),Some(AFP),None,List(),
    //      None,Some(Kitzbuehel),None,Some(Austria),List(sport)),Agency(Getty Images,Some(AFP),None),Agency(Getty Images,Some(AFP),None),
    //    List(),List(),
    //    LeasesByMedia(List(),None),List(),None,None)


    actual

  }

}

