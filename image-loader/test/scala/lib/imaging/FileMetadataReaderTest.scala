package test.lib.imaging

import com.gu.mediaservice.model._
import lib.imaging.FileMetadataReader
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Millis, Span}
import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.{JsArray, JsString, JsValue, Json}

/**
 * Test that the Reader returns the expected FileMetadata.
 *
 * This is somewhat akin to a unit test of the drew metadata
 * library (and our thin integration above it). It is meant to help
 * highlight differences and integration issues when upgrading the library.
 */
class FileMetadataReaderTest extends FunSpec with Matchers with ScalaFutures {

  import test.lib.ResourceHelpers._

  implicit override val patienceConfig = PatienceConfig(timeout = Span(1000, Millis), interval = Span(25, Millis))

  it("should read the correct dimensions for a JPG image") {
    val image = fileAt("getty.jpg")
    val dimsFuture = FileMetadataReader.dimensions(image, Some(Jpeg))
    whenReady(dimsFuture) { dimOpt =>
      dimOpt should be('defined)
      dimOpt.get.width should be(100)
      dimOpt.get.height should be(60)
    }
  }

  it("should read the correct dimensions for a tiff image") {
    val image = fileAt("flower.tif")
    val dimsFuture = FileMetadataReader.dimensions(image, Some(Tiff))
    whenReady(dimsFuture) { dimOpt =>
      dimOpt should be('defined)
      dimOpt.get.width should be(73)
      dimOpt.get.height should be(43)
    }
  }

  it("should read the correct dimensions for a png image") {
    val image = fileAt("schaik.com_pngsuite/basn0g08.png")
    val dimsFuture = FileMetadataReader.dimensions(image, Some(Png))
    whenReady(dimsFuture) { dimOpt =>
      dimOpt should be('defined)
      dimOpt.get.width should be(32)
      dimOpt.get.height should be(32)
    }
  }

  it("should read the correct metadata for Getty JPG images") {
    val image = fileAt("getty.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image, "dummy")
    whenReady(metadataFuture) { metadata =>
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

      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, exif)
      sameMaps(metadata.exifSub, Map())
      sameMaps(metadata.getty, getty)
      sameMaps(metadata.xmp, xmp)
    }
  }

  it("should 'redact' any long 'icc' fields") {
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(fileAt("longICC.png"), "dummy")
    whenReady(metadataFuture) { metadata =>
      metadata.icc("Color space") should be("RGB")
      metadata.icc("Blue TRC") should be(FileMetadataReader.redactionReplacementValue)
    }
  }

  it("should 'redact' any long 'xmp' fields") {
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(fileAt("longXMP.jpg"), "dummy")
    whenReady(metadataFuture) { metadata =>
      println(metadata.xmp)
      metadata.xmp("photoshop:Instructions") should be(JsString(FileMetadataReader.redactionReplacementValue))
      metadata.xmp("dc:publisher") should be(Json.toJson(List("Gu Grid Tests")))
    }
  }

  it("should read the xmp metadata as stored in the image (process image using GettyImagesGIFT prefix first)") {
    val rawPrefix0Xmp: Map[String, String] = Map(
      "GettyImagesGIFT:ImageRank" -> "3",
      "GettyImagesGIFT:OriginalFilename" -> "2008208_81774706JM148_England_v_Cze.jpg",
      "dc:subject[15]" -> "London - England",
      "dc:creator[1]" -> "Phil Cole",
      "dc:title[1]" -> "81774706JM148_England_v_Cze",
      "dc:title[1]/xml:lang" -> "x-default",
      "photoshop:SupplementalCategories[1]" -> "FOC",
      "photoshop:Headline" -> "England v Czech Republic - International Friendly",
      "photoshop:TransmissionReference" -> "81774706",
      "dc:subject[6]" -> "Vertical",
      "dc:description[1]/xml:lang" -> "x-default",
      "photoshop:AuthorsPosition" -> "Staff",
      "dc:subject[8]" -> "Full Length",
      "photoshop:CaptionWriter" -> "jm",
      "dc:subject[3]" -> "Full Body Isolated",
      "plus:ImageSupplierImageId" -> "82486881",
      "dc:description[1]" -> "LONDON - AUGUST 20:  Czech Republic goalkeeper Petr Cech in action during the international friendly match between England and the Czech Republic at Wembley Stadium on August 20, 2008 in London, England.  (Photo by Phil Cole/Getty Images)",
      "photoshop:SupplementalCategories[2]" -> "SPO",
      "dc:subject[16]" -> "Club Soccer",
      "dc:subject[4]" -> "Sport",
      "photoshop:City" -> "London",
      "GettyImagesGIFT:ExclusiveCoverage" -> "False",
      "dc:subject[9]" -> "Activity",
      "photoshop:DateCreated" -> "2008-08-20T00:00:00.000Z",
      "photoshop:Credit" -> "Getty Images",
      "dc:subject[13]" -> "Friendly Match",
      "dc:subject[7]" -> "Czech Republic",
      "dc:rights[1]" -> "2008 Getty Images",
      "GettyImagesGIFT:Composition" -> "Full Length",
      "GettyImagesGIFT:TimeShot" -> "212019+0200",
      "GettyImagesGIFT:Personality[1]" -> "Petr Cech",
      "dc:subject[17]" -> "Goalie",
      "photoshop:SupplementalCategories[3]" -> "SOC",
      "dc:rights[1]/xml:lang" -> "x-default",
      "GettyImagesGIFT:CameraMakeModel" -> "Canon EOS-1D Mark III",
      "dc:Rights" -> "2008 Getty Images",
      "GettyImagesGIFT:OriginalCreateDateTime" -> "2008-08-20T20:25:49.000Z",
      "dc:subject[10]" -> "Wembley Stadium",
      "dc:subject[2]" -> "Motion",
      "dc:subject[12]" -> "Soccer",
      "dc:subject[14]" -> "UK",
      "GettyImagesGIFT:AssetId" -> "82486881",
      "dc:subject[11]" -> "Stadium",
      "Iptc4xmpCore:CountryCode" -> "GBR",
      "dc:subject[1]" -> "England",
      "GettyImagesGIFT:CameraFilename" -> "8R8Z0144.JPG",
      "GettyImagesGIFT:CallForImage" -> "False",
      "photoshop:Country" -> "United Kingdom",
      "photoshop:Source" -> "Getty Images Europe",
      "photoshop:Category" -> "S",
      "GettyImagesGIFT:CameraSerialNumber" -> "0000571198",
      "xmpMM:InstanceID" -> "uuid:faf5bdd5-ba3d-11da-ad31-d33d75182f1b",
      "dc:subject[5]" -> "Petr Cech"
    )

    val expected = FileMetadataAggregator.aggregateMetadataMap(rawPrefix0Xmp)

    // `getty.jpg` uses the `GettyImagesGIFT` prefix, processing it first will populate the `XMPSchemaRegistry` cache,
    // resulting in `cech.jpg` to be read differently from the content in the file which uses the `prefix0` prefix.
    val gettyGiftXmpFuture = FileMetadataReader.fromIPTCHeaders(fileAt("getty.jpg"), "dummy")
    whenReady(gettyGiftXmpFuture) { _ =>
      val prefix0MetadataFuture = FileMetadataReader.fromIPTCHeaders(fileAt("cech.jpg"), "dummy")
      whenReady(prefix0MetadataFuture) { metadata =>
        sameMaps(metadata.xmp, expected)
      }
    }
  }

  it("should read the xmp metadata as stored in the image (process  image using prefix0 prefix first)") {
    val gettyGiftXmp: Map[String, JsValue] = Map(
      "GettyImagesGIFT:ImageRank" -> JsString("3"),
      "GettyImagesGIFT:OriginalFilename" -> JsString("43885812_SEA.jpg"),
      "dc:creator" -> JsArray(Seq(JsString("CHRISTOF STACHE"))),
      "dc:title" -> JsArray(Seq(
        JsString("536991815"),
        JsArray(Seq(JsString("{'xml:lang':'x-default'}"))),
      )),
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

    // `cech.jpg` uses the `prefix0` prefix, processing it first will populate the `XMPSchemaRegistry` cache,
    // resulting in `getty.jpg` to be read differently from the content in the file which uses the `GettyImagesGIFT` prefix.
    val prefix0MetadataFuture = FileMetadataReader.fromIPTCHeaders(fileAt("cech.jpg"), "dummy")
    whenReady(prefix0MetadataFuture) { _ =>
      val gettyGiftXmpFuture = FileMetadataReader.fromIPTCHeaders(fileAt("getty.jpg"), "dummy")
      whenReady(gettyGiftXmpFuture) { metadata =>
        sameMaps(metadata.xmp, gettyGiftXmp)
      }
    }
  }

  it("should always use the GettyImagesGIFT namespace for XMP metadata using the Getty schema") {
    val rawExpected: Map[String, String] = Map(
      "GettyImagesGIFT:ImageRank" -> "3",
      "GettyImagesGIFT:OriginalFilename" -> "2008208_81774706JM148_England_v_Cze.jpg",
      "dc:subject[15]" -> "London - England",
      "dc:creator[1]" -> "Phil Cole",
      "dc:title[1]" -> "81774706JM148_England_v_Cze",
      "dc:title[1]/xml:lang" -> "x-default",
      "photoshop:SupplementalCategories[1]" -> "FOC",
      "photoshop:Headline" -> "England v Czech Republic - International Friendly",
      "photoshop:TransmissionReference" -> "81774706",
      "dc:subject[6]" -> "Vertical",
      "dc:description[1]/xml:lang" -> "x-default",
      "photoshop:AuthorsPosition" -> "Staff",
      "dc:subject[8]" -> "Full Length",
      "photoshop:CaptionWriter" -> "jm",
      "dc:subject[3]" -> "Full Body Isolated",
      "plus:ImageSupplierImageId" -> "82486881",
      "dc:description[1]" -> "LONDON - AUGUST 20:  Czech Republic goalkeeper Petr Cech in action during the international friendly match between England and the Czech Republic at Wembley Stadium on August 20, 2008 in London, England.  (Photo by Phil Cole/Getty Images)",
      "photoshop:SupplementalCategories[2]" -> "SPO",
      "dc:subject[16]" -> "Club Soccer",
      "dc:subject[4]" -> "Sport",
      "photoshop:City" -> "London",
      "GettyImagesGIFT:ExclusiveCoverage" -> "False",
      "dc:subject[9]" -> "Activity",
      "photoshop:DateCreated" -> "2008-08-20T00:00:00.000Z",
      "photoshop:Credit" -> "Getty Images",
      "dc:subject[13]" -> "Friendly Match",
      "dc:subject[7]" -> "Czech Republic",
      "dc:rights[1]" -> "2008 Getty Images",
      "GettyImagesGIFT:Composition" -> "Full Length",
      "GettyImagesGIFT:TimeShot" -> "212019+0200",
      "GettyImagesGIFT:Personality[1]" -> "Petr Cech",
      "dc:subject[17]" -> "Goalie",
      "photoshop:SupplementalCategories[3]" -> "SOC",
      "dc:rights[1]/xml:lang" -> "x-default",
      "GettyImagesGIFT:CameraMakeModel" -> "Canon EOS-1D Mark III",
      "dc:Rights" -> "2008 Getty Images",
      "GettyImagesGIFT:OriginalCreateDateTime" -> "2008-08-20T20:25:49.000Z",
      "dc:subject[10]" -> "Wembley Stadium",
      "dc:subject[2]" -> "Motion",
      "dc:subject[12]" -> "Soccer",
      "dc:subject[14]" -> "UK",
      "GettyImagesGIFT:AssetId" -> "82486881",
      "dc:subject[11]" -> "Stadium",
      "Iptc4xmpCore:CountryCode" -> "GBR",
      "dc:subject[1]" -> "England",
      "GettyImagesGIFT:CameraFilename" -> "8R8Z0144.JPG",
      "GettyImagesGIFT:CallForImage" -> "False",
      "photoshop:Country" -> "United Kingdom",
      "photoshop:Source" -> "Getty Images Europe",
      "photoshop:Category" -> "S",
      "GettyImagesGIFT:CameraSerialNumber" -> "0000571198",
      "xmpMM:InstanceID" -> "uuid:faf5bdd5-ba3d-11da-ad31-d33d75182f1b",
      "dc:subject[5]" -> "Petr Cech"
    )
    val aggExpected = FileMetadataAggregator.aggregateMetadataMap(rawExpected)

    val metadataFuture = FileMetadataReader.fromIPTCHeaders(fileAt("cech.jpg"), "dummy")
    whenReady(metadataFuture) { metadata =>

      sameMaps(metadata.xmp, aggExpected)
    }
  }

  it("should read the correct metadata for Corbis JPG images") {
    val image = fileAt("corbis.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image, "dummy")
    whenReady(metadataFuture) { metadata =>
      val iptc = Map(
        "Country/Primary Location Name" -> "USA",
        "Category" -> "NEW",
        "Copyright Notice" -> "© Corbis.  All Rights Reserved.",
        "Supplemental Category(s)" -> "[Heben, Christopher]",
        "Application Record Version" -> "4",
        "Caption/Abstract" -> "01 Apr 2015, Akron, Ohio, USA --- April 1, 2015 - Akron, Ohio, U.S. - Former Navy SEAL CHRISTOPHER HEBEN gestures as he describes how he could only see the eyes for the driver of the car before he was shot during questioning by his lawyer James L. Burdon as he testifies in his own defense in Akron Municipal Court. Heben, 45, is charged with falsification and obstructing official business. (Credit Image: © Mike Cardew/TNS/ZUMA Wire) --- Image by © Mike Cardew/ZUMA Press/Corbis",
        "Credit" -> "© Mike Cardew/ZUMA Press/Corbis",
        "Source" -> "Corbis",
        "Image Orientation" -> "L",
        "City" -> "Akron",
        "Keywords" -> "Akron;clj;Great Lakes States;Midwest;North America;Ohio;Summit County;thepicturesoftheday.com;USA;zmct;zumapress.com",
        "By-line" -> "Mike Cardew",
        "Special Instructions" -> "For latest restrictions check www.corbisimages.com",
        "Headline" -> "Former Navy Seal On Trial",
        "Province/State" -> "Ohio",
        "Object Name" -> "42-70266837",
        "Original Transmission Reference" -> "70266837",
        "Date Created" -> "2015:04:01"
      )

      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, Map())
      sameMaps(metadata.exifSub, Map())
      sameMaps(metadata.getty, Map())
    }
  }

  it("should read the correct metadata for PA JPG images") {
    val image = fileAt("pa.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image, "dummy")
    whenReady(metadataFuture) { metadata =>
      val iptc = Map(
        "Country/Primary Location Name" -> "United Kingdom",
        "Fixture Identifier" -> "Warehouse",
        "Category" -> "S",
        "Copyright Notice" -> "PA Wire",
        "Supplemental Category(s)" -> "Cricket",
        "Application Record Version" -> "3",
        "Caption/Abstract" -> "File photo dated 24-06-2014 of England's Moeen Ali. PRESS ASSOCIATION Photo. Issue date: Thursday April 2, 2015. Moeen Ali is planning to join England for the latter stages of their Test tour of the West Indies, as his side injury continues to improve. See PA story CRICKET England Moeen. Photo credit should read Martin Rickett/PA Wire.",
        "Credit" -> "PA",
        "Source" -> "PA",
        "Image Orientation" -> "P",
        "City" -> "Leeds",
        "Keywords" -> "cricket england cricket world cup talking points",
        "Time Created" -> "15:10:41+0000",
        "By-line" -> "Martin Rickett",
        "Special Instructions" -> "FILE PHOTO Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information. Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information.",
        "Headline" -> "Cricket - Moeen Ali File Photo",
        "Object Name" -> "CRICKET England Moeen 111162",
        "Reference Date" -> "2015:04:02",
        "Original Transmission Reference" -> "CRICKET_England_Moeen_111162.JPG",
        "Date Created" -> "2015:04:02",
        "Date Time Created Composite" -> "2015-04-02T15:10:41.000Z"
      )
      val exif = Map(
        "Image Description" -> "England's Moeen Ali plays defensively from the bowling of Sri Lanka's Shaminda Eranga, during day five of the second Investec Test match at Headingley, Leeds. PRESS ASSOCIATION Photo. Picture date: Tuesday June 24, 2014. See PA Story CRICKET England. Photo credit should read: Martin Rickett/PA Wire. Editorial use only. RESTRICTIONS: Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information.",
        "X Resolution" -> "200 dots per inch",
        "Software" -> "Adobe Photoshop CS2 Windows",
        "Make" -> "NIKON CORPORATION",
        "YCbCr Positioning" -> "Datum point",
        "Copyright" -> "PA Wire",
        "Date/Time" -> "2014:06:24 15:18:55",
        "Model" -> "NIKON D4",
        "Orientation" -> "Top, left side (Horizontal / normal)",
        "Resolution Unit" -> "Inch",
        "Y Resolution" -> "200 dots per inch",
        "Artist" -> "Martin Rickett"
      )
      val exifSub = Map(
        "CFA Pattern" -> "[Red,Green][Green,Blue]",
        "Exif Version" -> "2.30",
        "Subject Distance Range" -> "Unknown",
        "Exposure Mode" -> "Manual exposure",
        "ISO Speed Ratings" -> "400",
        "Compressed Bits Per Pixel" -> "4 bits/pixel",
        "Custom Rendered" -> "Normal process",
        "Exif Image Height" -> "1672 pixels",
        "Flash" -> "Flash did not fire",
        "White Balance" -> "Unknown",
        "Focal Length" -> "600 mm",
        "Date/Time Original" -> "2014:06:24 15:10:41",
        "Date/Time Original Composite" -> "2014-06-24T15:10:41.700Z",
        "White Balance Mode" -> "Auto white balance",
        "Exif Image Width" -> "1264 pixels",
        "Gain Control" -> "Low gain up",
        "Sensing Method" -> "One-chip color area sensor",
        "Scene Type" -> "Directly photographed image",
        "Sub-Sec Time Original" -> "70",
        "Exposure Time" -> "1/1600 sec",
        "Sharpness" -> "Hard",
        "Metering Mode" -> "Multi-segment",
        "Exposure Program" -> "Manual control",
        "Digital Zoom Ratio" -> "1",
        "Exposure Bias Value" -> "1/3 EV",
        "F-Number" -> "f/4.0",
        "Color Space" -> "sRGB",
        "FlashPix Version" -> "1.00",
        "Sub-Sec Time" -> "70",
        "Components Configuration" -> "YCbCr",
        "Focal Length 35" -> "600 mm",
        "Date/Time Digitized" -> "2014:06:24 15:10:41",
        "Sensitivity Type" -> "Recommended Exposure Index",
        "Contrast" -> "None",
        "Scene Capture Type" -> "Standard",
        "File Source" -> "Digital Still Camera (DSC)",
        "Sub-Sec Time Digitized" -> "70",
        "Saturation" -> "None",
        "Max Aperture Value" -> "f/4.0"
      )

      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, exif)
      sameMaps(metadata.exifSub, exifSub)
      sameMaps(metadata.getty, Map())
    }
  }
  it("should read the correct metadata for tiff images") {
    val image = fileAt("flag.tif")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image, "dummy")
    whenReady(metadataFuture) { metadata =>
      val iptc = Map(
        "Country/Primary Location Name" -> "United Kingdom",
        "Fixture Identifier" -> "Warehouse",
        "Category" -> "S",
        "Copyright Notice" -> "PA Wire",
        "Supplemental Category(s)" -> "Cricket",
        "Application Record Version" -> "3",
        "Caption/Abstract" -> "File photo dated 24-06-2014 of England's Moeen Ali. PRESS ASSOCIATION Photo. Issue date: Thursday April 2, 2015. Moeen Ali is planning to join England for the latter stages of their Test tour of the West Indies, as his side injury continues to improve. See PA story CRICKET England Moeen. Photo credit should read Martin Rickett/PA Wire.",
        "Credit" -> "PA",
        "Source" -> "PA",
        "Image Orientation" -> "P",
        "City" -> "Leeds",
        "Keywords" -> "cricket england cricket world cup talking points",
        "Time Created" -> "15:10:41+0000",
        "By-line" -> "Martin Rickett",
        "Special Instructions" -> "FILE PHOTO Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information. Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information.",
        "Headline" -> "Cricket - Moeen Ali File Photo",
        "Object Name" -> "CRICKET England Moeen 111162",
        "Reference Date" -> "2015:04:02",
        "Original Transmission Reference" -> "CRICKET_England_Moeen_111162.JPG",
        "Date Created" -> "2015:04:02",
        "Date Time Created Composite" -> "2015-04-02T15:10:41.000Z"
      )
      val exif = Map(
        "Image Description" -> "England's Moeen Ali plays defensively from the bowling of Sri Lanka's Shaminda Eranga, during day five of the second Investec Test match at Headingley, Leeds. PRESS ASSOCIATION Photo. Picture date: Tuesday June 24, 2014. See PA Story CRICKET England. Photo credit should read: Martin Rickett/PA Wire. Editorial use only. RESTRICTIONS: Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information.",
        "X Resolution" -> "200 dots per inch",
        "Software" -> "Adobe Photoshop CS2 Windows",
        "Make" -> "NIKON CORPORATION",
        "Rows Per Strip" -> "55 rows/strip",
        "Compression" -> "Uncompressed",
        "New Subfile Type" -> "Full-resolution image",
        "Photometric Interpretation" -> "RGB",
        "Strip Byte Counts" -> "20460 20460 5208 bytes",
        "Bits Per Sample" -> "8 8 8 bits/component/pixel",
        "Strip Offsets" -> "8206 28666 49126",
        "Image Height" -> "124 pixels",
        "Image Width" -> "124 pixels",
        "Samples Per Pixel" -> "3 samples/pixel",
        "Copyright" -> "PA Wire",
        "Date/Time" -> "2014:06:24 15:18:55",
        "Model" -> "NIKON D4",
        "Orientation" -> "Top, left side (Horizontal / normal)",
        "Resolution Unit" -> "Inch",
        "Y Resolution" -> "200 dots per inch",
        "Artist" -> "Martin Rickett"
      )
      val exifSub = Map(
        "CFA Pattern" -> "[Red,Green][Green,Blue]",
        "Exif Version" -> "2.30",
        "Subject Distance Range" -> "Unknown",
        "Exposure Mode" -> "Manual exposure",
        "ISO Speed Ratings" -> "400",
        "Custom Rendered" -> "Normal process",
        "Exif Image Height" -> "1672 pixels",
        "User Comment" -> "ASCII",
        "White Balance" -> "Unknown",
        "Focal Length" -> "600 mm",
        "Date/Time Original" -> "2014:06:24 15:10:41",
        "Date/Time Original Composite" -> "2014-06-24T15:10:41.700Z",
        "White Balance Mode" -> "Auto white balance",
        "Exif Image Width" -> "1264 pixels",
        "Gain Control" -> "Low gain up",
        "Sensing Method" -> "One-chip color area sensor",
        "Scene Type" -> "Directly photographed image",
        "Sub-Sec Time Original" -> "70",
        "Exposure Time" -> "1/1600 sec",
        "Sharpness" -> "Hard",
        "Metering Mode" -> "Multi-segment",
        "Exposure Program" -> "Manual control",
        "Digital Zoom Ratio" -> "1",
        "Exposure Bias Value" -> "1/3 EV",
        "F-Number" -> "f/4.0",
        "Color Space" -> "sRGB",
        "FlashPix Version" -> "1.00",
        "Sub-Sec Time" -> "70",
        "Components Configuration" -> "YCbCr",
        "Focal Length 35" -> "600 mm",
        "Date/Time Digitized" -> "2014:06:24 15:10:41",
        "Sensitivity Type" -> "Recommended Exposure Index",
        "Contrast" -> "None",
        "Scene Capture Type" -> "Standard",
        "File Source" -> "Digital Still Camera (DSC)",
        "Sub-Sec Time Digitized" -> "70",
        "Saturation" -> "None",
        "Max Aperture Value" -> "f/4.0"
      )

      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, exif)
      sameMaps(metadata.exifSub, exifSub)
      sameMaps(metadata.getty, Map())
    }
  }

  it("should read the correct metadata for Guardian photographer JPG images") {
    val image = fileAt("guardian-turner.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image, "dummy")
    val iptc = Map(
      "Coded Character Set" -> "UTF-8",
      "Application Record Version" -> "0",
      "Caption/Abstract" -> "Reuben Smith age 5 from Hampshire and  \"Darwin Hybrid Mix' tulips in the cut flower Garden at Arundel Castle.\r18,000 tulips were planted in  a total of 52,000 spring bulbs last autumn.\rPhotograph: Graham Turner.",
      "Time Created" -> "01:08:44+0000",
      "By-line" -> "Graham Turner",
      "Object Name" -> "Tulips",
      "Date Created" -> "2015:04:15",
      "Date Time Created Composite" -> "2015-04-15T01:08:44.000Z"
    )
    val exif = Map(
      "Image Description" -> "Reuben Smith age 5 from Hampshire and  \"Darwin Hybrid Mix' tulips in the cut flower Garden at Arundel Castle.\n18,000 tulips were planted in  a total of 52,000 spring bulbs last autumn.\nPhotograph: Graham Turner.",
      "X Resolution" -> "300 dots per inch",
      "Software" -> "Adobe Photoshop CS6 (Macintosh)",
      "Make" -> "Canon",
      "Date/Time" -> "2015:04:15 15:22:46",
      "Model" -> "Canon EOS 5D Mark III",
      "Orientation" -> "Top, left side (Horizontal / normal)",
      "Resolution Unit" -> "Inch",
      "Y Resolution" -> "300 dots per inch",
      "Artist" -> "Graham Turner"
    )
    val exifSub = Map(
      "Exif Version" -> "2.30",
      "Exposure Mode" -> "Manual exposure",
      "ISO Speed Ratings" -> "320",
      "Lens Specification" -> "70-200mm",
      "Body Serial Number" -> "093024002053",
      "Custom Rendered" -> "Normal process",
      "Exif Image Height" -> "3840 pixels",
      "Lens Serial Number" -> "000043c4bb",
      "Flash" -> "Flash did not fire",
      "Focal Length" -> "88 mm",
      "Date/Time Original" -> "2015:04:15 01:08:44",
      "Date/Time Original Composite" -> "2015-04-15T01:08:44.880Z",
      "White Balance Mode" -> "Auto white balance",
      "Shutter Speed Value" -> "1/1599 sec",
      "Exif Image Width" -> "5760 pixels",
      "Focal Plane Y Resolution" -> "1/1600 cm",
      "Sub-Sec Time Original" -> "88",
      "Exposure Time" -> "1/1600 sec",
      "Metering Mode" -> "Multi-segment",
      "Exposure Program" -> "Manual control",
      "Exposure Bias Value" -> "0 EV",
      "F-Number" -> "f/3.5",
      "Color Space" -> "Undefined",
      "Sub-Sec Time" -> "88",
      "Lens Model" -> "EF70-200mm f/2.8L IS II USM",
      "Date/Time Digitized" -> "2015:04:15 01:08:44",
      "Recommended Exposure Index" -> "320",
      "Aperture Value" -> "f/3.5",
      "Sensitivity Type" -> "Recommended Exposure Index",
      "Scene Capture Type" -> "Standard",
      "Focal Plane Resolution Unit" -> "cm",
      "Sub-Sec Time Digitized" -> "88",
      "Focal Plane X Resolution" -> "1/1600 cm",
      "Max Aperture Value" -> "f/2.8"
    )

    whenReady(metadataFuture) { metadata =>
      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, exif)
      sameMaps(metadata.exifSub, exifSub)
      sameMaps(metadata.getty, Map())
    }
  }

  it("should read the correct metadata for a grayscale png") {
    val image = fileAt("schaik.com_pngsuite/basn0g08.png")
    val metadataFuture = FileMetadataReader.fromIPTCHeadersWithColorInfo(image, "dummy", Png)
    whenReady(metadataFuture) { metadata =>
      metadata.colourModelInformation should contain(
        "colorType" -> "Greyscale"
      )
    }
  }

  it("should read the correct metadata for a colour 8bit paletted png") {
    val image = fileAt("schaik.com_pngsuite/basn3p08.png")
    val metadataFuture = FileMetadataReader.fromIPTCHeadersWithColorInfo(image, "dummy", Png)
    whenReady(metadataFuture) { metadata =>
      metadata.colourModelInformation should contain(
        "colorType" -> "Indexed Color"
      )
    }
  }

  it("should read the correct metadata for a truecolour png without alpha channel") {
    val image = fileAt("schaik.com_pngsuite/basn2c08.png")
    val metadataFuture = FileMetadataReader.fromIPTCHeadersWithColorInfo(image, "dummy", Png)
    whenReady(metadataFuture) { metadata =>
      metadata.colourModelInformation should contain(
        "colorType" -> "True Color"
      )
    }
  }

  it("should read the correct metadata for a truecolour pnd with alpha channel") {
    val image = fileAt("schaik.com_pngsuite/basn6a08.png")
    val metadataFuture = FileMetadataReader.fromIPTCHeadersWithColorInfo(image, "dummy", Png)
    whenReady(metadataFuture) { metadata =>
      metadata.colourModelInformation should contain(
        "colorType" -> "True Color with Alpha"
      )
    }
  }

  it("should read the correct colour metadata for a greyscale tiff") {
    val image = fileAt("flower.tif")
    val metadataFuture = FileMetadataReader.fromIPTCHeadersWithColorInfo(image, "dummy", Tiff)
    whenReady(metadataFuture) { metadata =>
      metadata.colourModelInformation should contain(
        "photometricInterpretation" -> "BlackIsZero"
      )
    }
  }

  it("should read the correct colour metadata for an alpha tiff") {
    val image = fileAt("lighthouse.tif")
    val metadataFuture = FileMetadataReader.fromIPTCHeadersWithColorInfo(image, "dummy", Tiff)
    whenReady(metadataFuture) { metadata =>
      metadata.colourModelInformation should contain(
        "photometricInterpretation" -> "RGB"
      )
    }
  }

  def sameMaps[T](actual: Map[String, T], expected: Map[String, T]) = {
    // Detect mismatching keys
    actual.keys should be(expected.keys)

    // Detect mismatching values individually for better errors
    actual.keys.foreach { key =>
      actual.get(key) should be(expected.get(key))
    }
  }
}
