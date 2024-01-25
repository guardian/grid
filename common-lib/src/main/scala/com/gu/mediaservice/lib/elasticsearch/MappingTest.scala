package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{DenyUseLease, LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage._
import org.joda.time.{DateTime, Period}
import play.api.libs.json.{JsArray, JsNumber, JsString, JsValue}

import java.net.{URI, URL}

/**
  * This object contains a test image that is fully populated (i.e. all fields of a collection
  * type including options have a value rather than None, Nil or other empty alternative).
  * This is used to test that the elasticsearch mapping is still correct when changes are
  * made to the model.
  */
object MappingTest {
  // various dates for use below - these are deliberately a long time ago in case we accidentally leave anything lying
  // around
  private val imageTaken: DateTime = new DateTime(2010, 3, 26, 12, 0)
  private val imageImported: DateTime = imageTaken.plus(Period.days(1).plusHours(1))
  private val imageModified: DateTime = imageImported.plus(Period.hours(2))
  private val imageDenyLeaseExpiry: DateTime = new DateTime(2030, 3, 26, 12, 0)
  private val imageSoftDeleted: DateTime = imageImported.plus(Period.hours(2))

  private val testImageMetadata: ImageMetadata = ImageMetadata(
    dateTaken = Some(imageTaken),
    description = Some("a very lovely photograph"),
    credit = Some("Bill Withers"),
    creditUri = Some("https://bill.example.com"),
    byline = Some("Bill and Friends"),
    bylineTitle = Some("Bill"),
    title = Some("Lovely day"),
    copyright = Some("Bill 1999"),
    suppliersReference = Some("ASDFFF"),
    source = Some("bill-withers"),
    specialInstructions = Some("This is really important."),
    keywords = Some(Set("sunset", "loveliness", "distance")),
    subLocation = Some("Downtown"),
    city = Some("LA"),
    state = Some("California"),
    country = Some("USA"),
    subjects = Some(List("Bill", "Friends")),
    peopleInImage = Some(Set("Bill", "Friends", "Other friends")),
    domainMetadata = Map(
      "important-domain" -> Map(
        "foo" -> JsString("bar"),
        "size" -> JsNumber(12345)
      )
    )
  )

  private val testAsset: Asset = Asset(
    file = new URI("file://filename.jpg"),
    size = Some(12345L),
    mimeType = Some(Jpeg),
    dimensions = Some(Dimensions(1000, 2000)),
    secureUrl = Some(new URL("http://host/filename.jpg"))
  )

  val testUploader = "grid-internal-mapping-test-image" // Do not change this, we use it to clean up old test images

  val testImage: Image = Image(
    id = "abcdef1234567890",
    uploadTime = imageImported,
    uploadedBy = testUploader, // Do not change this, we use it to clean up old test images
    softDeletedMetadata = Some(SoftDeletedMetadata(DateTime.now, "user@test.uk")),
    lastModified = Some(imageModified),
    identifiers = Map("id1" -> "value1"),
    uploadInfo = UploadInfo(
      filename = Some("filename.jpg")
    ),
    source = testAsset,
    thumbnail = Some(Asset(
      file = new URI("file://thumb.jpg"),
      size = Some(1234L),
      mimeType = Some(Jpeg),
      dimensions = Some(Dimensions(500, 1000)),
      secureUrl = Some(new URL("http://host/thumb.jpg"))
    )),
    optimisedPng = Some(Asset(
      file = new URI("file://filename.png"),
      size = Some(1245L),
      mimeType = Some(Png),
      dimensions = Some(Dimensions(1000, 2000)),
      secureUrl = Some(new URL("http://host/filename.jpg"))
    )),
    fileMetadata = FileMetadata(
      iptc = Map("iptc1" -> "value1"),
      exif = Map("exif1" -> "value1"),
      exifSub = Map("exifSub1" -> "value1"),
      xmp = Map(
        "xmp1" -> JsString("value1"),
        "xmp2" -> JsNumber(12345),
        "xmp3" -> JsArray(List(JsString("value2"), JsString("value3")))
      ),
      icc = Map("icc1" -> "value1"),
      getty = Map("getty1" -> "value1"),
      colourModel = Some("my-model"),
      colourModelInformation = Map("colourModel1" -> "value1")
    ),
    userMetadata = Some(Edits(
      archived = true,
      labels = List("a label", "another label"),
      metadata = testImageMetadata,
      usageRights = Some(NoRights),
      photoshoot = Some(Photoshoot("crazy times shoot")),
      lastModified = Some(imageModified)
    )),
    metadata = testImageMetadata,
    originalMetadata = testImageMetadata,
    usageRights = Agency(
      supplier = "Karpow Images Inc",
      suppliersCollection = Some("All The Metadata™"),
      restrictions = Some("All the time")
    ),
    originalUsageRights = StaffPhotographer(
      photographer = "Barton",
      publication = "Bricking It (The Lego Times)",
      restrictions = Some("Not before June")
    ),
    exports = List(
      Crop(
        id = Some("1234567890987654321"),
        author = Some("me"),
        date = Some(imageModified),
        specification = CropSpec(
          uri = "http://host/file",
          bounds = Bounds(
            x = 100, y = 100, width = 500, height = 300
          ),
          aspectRatio = Some("5:3"),
          `type` = CropExport
        ),
        master = Some(testAsset),
        assets = List(testAsset)
      )
    ),
    usages = List(Usage(
      id = "usage1",
      references = List(
        UsageReference(
          `type` = FrontendUsageReference,
          uri = Some(new URI("something:fancy")),
          name = Some("frontend-use")
        )
      ),
      platform = DigitalUsage,
      media = "some-media",
      status = PublishedUsageStatus,
      dateAdded = Some(imageTaken),
      dateRemoved = Some(imageModified),
      lastModified = imageModified,
      printUsageMetadata = Some(
        PrintUsageMetadata(
          sectionName = "g1",
          issueDate = imageModified,
          pageNumber = 1,
          storyName = "front-page-story",
          publicationCode = "G1M",
          publicationName = "G1 main",
          layoutId = Some(1234L),
          edition = Some(1),
          size = Some(PrintImageSize(500, 300)),
          orderedBy = Some("Bob"),
          sectionCode = "NEWS",
          notes = Some("a boss story"),
          source = Some("source information")
        )
      ),
      digitalUsageMetadata = Some(DigitalUsageMetadata(
        webUrl = new URI("https://gu.com/12345"),
        webTitle = "Article title",
        sectionId = "uk/news",
        composerUrl = Some(new URI("https://composer/api/2345678987654321345678"))
      )),
      syndicationUsageMetadata = Some(SyndicationUsageMetadata(
        partnerName = "friends of ours",
        syndicatedBy = Some("Bob")
      )),
      frontUsageMetadata = Some(FrontUsageMetadata(
        addedBy = "me",
        front = "uk/news"
      )),
      downloadUsageMetadata = Some(DownloadUsageMetadata(
        downloadedBy = "me"
      ))
    )),
    leases = LeasesByMedia.build(List(
      MediaLease(
        id = Some("leaseA"),
        leasedBy = Some(testUploader),
        startDate = Some(imageTaken),
        endDate = Some(imageDenyLeaseExpiry),
        access = DenyUseLease,
        notes = Some("this prevents use of this test image and should hide it from the default view"),
        mediaId = "an id for leaseA",
        createdAt = imageTaken
      )
    )),
    collections = List(
      Collection(
        path = List(
          "a/path",
          "another/path"
        ),
        actionData = ActionData(
          author = "me",
          date = imageModified
        ),
        description = "useful collection"
      )
    ),
    syndicationRights = Some(SyndicationRights(
      published = Some(imageTaken),
      suppliers = List(
        Supplier(
          supplierName = Some("I sell photographs"),
          supplierId = Some("i-sell-photos"),
          prAgreement = Some(true)
        )
      ),
      rights = List(
        Right(
          rightCode = "myCode",
          acquired = Some(true),
          properties = List(
            Property(
              propertyCode = "propCode",
              expiresOn = Some(imageModified),
              value = Some("aValue")
            )
          )
        )
      ),
      isInferred = true
    )),
    userMetadataLastModified = Some(imageModified)
  )
}
