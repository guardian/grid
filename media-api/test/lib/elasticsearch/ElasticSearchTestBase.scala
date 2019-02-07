package lib.elasticsearch

import java.util.UUID

import com.gu.mediaservice.model.{Edits, FileMetadata, ImageMetadata, Handout, StaffPhotographer}
import org.joda.time.DateTime
import org.scalatest.concurrent.PatienceConfiguration.{Interval, Timeout}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Milliseconds, Seconds, Span}
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}

class ElasticSearchTestBase extends FunSpec with BeforeAndAfterAll with Matchers with ScalaFutures with Fixtures {

  val interval = Interval(Span(100, Milliseconds))
  val timeout = Timeout(Span(10, Seconds))

  lazy val images = Seq(
    createImage(UUID.randomUUID().toString, Handout()),
    createImage(UUID.randomUUID().toString, StaffPhotographer("Yellow Giraffe", "The Guardian")),
    createImage(UUID.randomUUID().toString, Handout(), usages = List(createDigitalUsage())),

    // with user metadata
    createImage(id = "test-image-13-edited", Handout()).copy(userMetadata = Some(Edits(metadata = ImageMetadata(credit = Some("author")))), uploadTime = DateTime.now.minusDays(25)),
    createImage(id = "test-image-14-unedited", Handout()).copy(uploadTime = DateTime.now.minusDays(25)),

    // available for syndication
    createImageForSyndication(
      id = "test-image-1",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(allowed = true, "test-image-1"))
    ),

    // has a digital usage, still eligible for syndication
    createImageForSyndication(
      id = "test-image-2",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(allowed = true, "test-image-2")),
      List(createDigitalUsage())
    ),

    // has syndication usage, not available for syndication
    createImageForSyndication(
      id = "test-image-3",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(allowed = true, "test-image-3")),
      List(createDigitalUsage(), createSyndicationUsage())
    ),

    // rights acquired, explicit allow syndication lease and unknown publish date, available for syndication
    createImageForSyndication(
      id = "test-image-4",
      rightsAcquired = true,
      None,
      Some(createSyndicationLease(allowed = true, "test-image-4"))
    ),

    // explicit deny syndication lease with no end date, not available for syndication
    createImageForSyndication(
      id = "test-image-5",
      rightsAcquired = true,
      None,
      Some(createSyndicationLease(allowed = false, "test-image-5"))
    ),

    // explicit deny syndication lease with end date before now, available for syndication
    createImageForSyndication(
      id = "test-image-6",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(allowed = false, "test-image-6", endDate = Some(DateTime.parse("2018-01-01T00:00:00"))))
    ),

    // images published after "today", not available for syndication
    createImageForSyndication(
      id = "test-image-7",
      rightsAcquired = true,
      Some(DateTime.parse("2018-07-02T00:00:00")),
      Some(createSyndicationLease(allowed = false, "test-image-7"))
    ),

    // with fileMetadata
    createImageForSyndication(
      id = "test-image-8",
      rightsAcquired = true,
      Some(DateTime.parse("2018-07-03T00:00:00")),
      None,
      fileMetadata = Some(FileMetadata(xmp = Map(
        "foo" -> "bar",
        "toolong" -> stringLongerThan(100000)
      )))
    ),

    // no rights acquired, not available for syndication
    createImageForSyndication(UUID.randomUUID().toString, rightsAcquired = false, None, None),

    // Agency image with published usage yesterday
    createImageForSyndication(
      id = "test-image-9",
      rightsAcquired = false,
      None,
      None,
      usageRights = agency,
      usages = List(createDigitalUsage(date = DateTime.now.minusDays(1)))
    ),

    // Agency image with published just now
    createImageForSyndication(
      id = "test-image-10",
      rightsAcquired = false,
      None,
      Some(createSyndicationLease(allowed = true, "test-image-10")),
      usageRights = agency,
      usages = List(createDigitalUsage(date = DateTime.now))
    ),

    // Screen grab with rights acquired, not eligible for syndication review
    createImageForSyndication(
      id = "test-image-11",
      rightsAcquired = true,
      rcsPublishDate = None,
      lease = None,
      usageRights = screengrab,
      usages = List(createDigitalUsage(date = DateTime.now))
    ),

    // Staff photographer with rights acquired, eligible for syndication review
    createImageForSyndication(
      id = "test-image-12",
      rightsAcquired = true,
      rcsPublishDate = None,
      lease = None,
      usageRights = staffPhotographer,
      usages = List(createDigitalUsage(date = DateTime.now))
    )
  )
}
