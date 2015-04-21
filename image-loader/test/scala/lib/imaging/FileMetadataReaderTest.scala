package scala.lib.imaging

import java.io.{FileNotFoundException, File}

import org.scalatest.{FunSpec, Matchers}
import org.scalatest.concurrent.ScalaFutures

import lib.imaging.FileMetadataReader


/**
 * Test that the Reader returns the expected FileMetadata.
 *
 * This is somewhat akin to a unit test of the drew metadata
 * library (and our thin integration above it). It is meant to help
 * highlight differences and integration issues when upgrading the library.
 */
class FileMetadataReaderTest extends FunSpec with Matchers with ScalaFutures {

  it("should read the correct dimensions for a JPG images") {
    val image = fileAt("getty.jpg")
    val dimsFuture = FileMetadataReader.dimensions(image)
    whenReady(dimsFuture) { dimOpt =>
      dimOpt should be ('defined)
      dimOpt.get.width should be (100)
      dimOpt.get.height should be (60)
    }
  }



  it("should read the correct metadata for Getty JPG images") {
    val image = fileAt("getty.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image)
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


      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, exif)
      sameMaps(metadata.exifSub, Map())
      sameMaps(metadata.xmp, Map())
    }
  }

  it("should read the correct metadata for Corbis JPG images") {
    val image = fileAt("corbis.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image)
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
        "City" -> "Akron",
        "Keywords" -> "Akron;clj;Great Lakes States;Midwest;North America;Ohio;Summit County;thepicturesoftheday.com;USA;zmct;zumapress.com",
        "By-line" -> "Mike Cardew",
        "Special Instructions" -> "For latest restrictions check www.corbisimages.com",
        "Headline" -> "Former Navy Seal On Trial",
        "Province/State" -> "Ohio",
        "Object Name" -> "42-70266837",
        "Original Transmission Reference" -> "70266837",
        "Date Created" -> "Wed Apr 01 00:00:00 BST 2015"
      )

      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, Map())
      sameMaps(metadata.exifSub, Map())
      sameMaps(metadata.xmp, Map())
    }
  }

  it("should read the correct metadata for PA JPG images") {
    val image = fileAt("pa.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image)
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
        "City" -> "Leeds",
        "Keywords" -> "cricket england cricket world cup talking points",
        "Time Created" -> "15:10:41+0000",
        "By-line" -> "Martin Rickett",
        "Special Instructions" -> "FILE PHOTO Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information. Use subject to restrictions. Editorial use only. No commercial use. Call 44 (0)1158 447447 for further information.",
        "Headline" -> "Cricket - Moeen Ali File Photo",
        "Object Name" -> "CRICKET England Moeen 111162",
        "Reference Date" -> "20150402",
        "Original Transmission Reference" -> "CRICKET_England_Moeen_111162.JPG",
        "Date Created" -> "Thu Apr 02 00:00:00 BST 2015"
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
        "CFA Pattern" -> "0 2 0 2 0 1 1 2",
        "Exif Version" -> "2.30",
        "Subject Distance Range" -> "Unknown",
        "Exposure Mode" -> "Manual exposure",
        "ISO Speed Ratings" -> "400",
        "Compressed Bits Per Pixel" -> "4 bits/pixel",
        "Custom Rendered" -> "Normal process",
        "Exif Image Height" -> "1672 pixels",
        "Flash" -> "Flash did not fire",
        "White Balance" -> "Unknown",
        "Focal Length" -> "600.0 mm",
        "Date/Time Original" -> "2014:06:24 15:10:41",
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
        "F-Number" -> "F4",
        "Color Space" -> "sRGB",
        "FlashPix Version" -> "1.00",
        "Sub-Sec Time" -> "70",
        "Components Configuration" -> "YCbCr",
        "Focal Length 35" -> "600mm",
        "Date/Time Digitized" -> "2014:06:24 15:10:41",
        "Sensitivity Type" -> "Recommended Exposure Index",
        "Contrast" -> "None",
        "Scene Capture Type" -> "Standard",
        "File Source" -> "Digital Still Camera (DSC)",
        "Sub-Sec Time Digitized" -> "70",
        "Saturation" -> "None",
        "Max Aperture Value" -> "F4"
      )

      sameMaps(metadata.iptc, iptc)
      sameMaps(metadata.exif, exif)
      sameMaps(metadata.exifSub, exifSub)
      sameMaps(metadata.xmp, Map())
    }
  }

  it("should read the correct metadata for Guardian photographer JPG images") {
    val image = fileAt("guardian-turner.jpg")
    val metadataFuture = FileMetadataReader.fromIPTCHeaders(image)
    whenReady(metadataFuture) { metadata =>
      sameMaps(metadata.xmp, Map())
    }
  }

  def sameMaps(actual: Map[String, String], expected: Map[String, String]) = {
    // Detect mismatching keys
    actual.keys should be (expected.keys)

    // Detect mismatching values individually for better errors
    actual.keys.foreach { key =>
      actual.get(key) should be (expected.get(key))
    }
  }

  def fileAt(resourcePath: String): File = {
    new File(getClass.getResource(s"/$resourcePath").toURI)
  }
}
