package lib.elasticsearch

import java.util.UUID

import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.scalatest.concurrent.PatienceConfiguration.{Interval, Timeout}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Milliseconds, Seconds, Span}
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}

class ElasticSearchTestBase extends FunSpec with BeforeAndAfterAll with Matchers with ScalaFutures with Fixtures {

  val interval = Interval(Span(100, Milliseconds))
  val timeout = Timeout(Span(10, Seconds))

  val imagesSentForSyndication: Seq[Image] = Seq(
    createImageForSyndication(
      id = "syndication-sent-1",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(allowed = true, "syndication-sent-1")),
      List(
        createDigitalUsage(),
        createSyndicationUsage()
      )
    )
  )

  val imagesQueuedForSyndication: Seq[Image] = Seq(
    createImageForSyndication(
      id = "syndication-queued-1",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(allowed = true, "syndication-queued-1"))
    ),

    // has a digital usage
    createImageForSyndication(
      id = "syndication-queued-2",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(allowed = true, "syndication-queued-2")),
      List(createDigitalUsage())
    ),

    // explicit allow syndication lease and unknown publish date
    createImageForSyndication(
      id = "syndication-queued-3",
      rightsAcquired = true,
      None,
      Some(createSyndicationLease(allowed = true, "syndication-queued-3"))
    ),

    // published after "today", not available on Syndication Tier
    createImageForSyndication(
      id = "syndication-queued-4",
      rightsAcquired = true,
      Some(DateTime.parse("2018-07-02T00:00:00")),
      Some(createSyndicationLease(allowed = false, "syndication-queued-4"))
    )
  )

  val imagesForSyndicationReview: Seq[Image] = Seq(
    createImageForSyndication(
      id = "syndication-review-1",
      rightsAcquired = true,
      rcsPublishDate = None,
      lease = None,
      usageRights = staffPhotographer,
      usages = List(createDigitalUsage(date = DateTime.now))
    ),

    // expired deny syndication lease
    createImageForSyndication(
      id = "syndication-review-2",
      rightsAcquired = true,
      Some(DateTime.parse("2018-01-01T00:00:00")),
      Some(createSyndicationLease(
        allowed = false,
        "syndication-review-1",
        endDate = Some(DateTime.parse("2018-01-01T00:00:00")))
      )
    )
  )

  val imagesBlockedForSyndication: Seq[Image] = Seq(
    // explicit deny syndication lease with no end date, not available for syndication
    createImageForSyndication(
      id = "syndication-blocked-1",
      rightsAcquired = true,
      None,
      Some(createSyndicationLease(allowed = false, "syndication-blocked-1"))
    ),
  )

  val imagesUnavailableForSyndication: Seq[Image] = Seq(
    createImageForSyndication(
      id = "syndication-unavailable-1",
      rightsAcquired = false,
      None,
      None
    ),

    // Agency image with published usage yesterday
    createImageForSyndication(
      id = "syndication-unavailable-2",
      rightsAcquired = false,
      None,
      None,
      usageRights = agency,
      usages = List(createDigitalUsage(date = DateTime.now.minusDays(1)))
    ),

    // Agency image with published just now
    createImageForSyndication(
      id = "syndication-unavailable-3",
      rightsAcquired = false,
      None,
      Some(createSyndicationLease(allowed = true, "syndication-unavailable-3")),
      usageRights = agency,
      usages = List(createDigitalUsage(date = DateTime.now))
    ),

    // Screen grab with rights acquired, not eligible for syndication review
    createImageForSyndication(
      id = "syndication-unavailable-4",
      rightsAcquired = true,
      rcsPublishDate = None,
      lease = None,
      usageRights = screengrab,
      usages = List(createDigitalUsage(date = DateTime.now))
    ),
  )

  val standardImages: Seq[Image] = Seq(
    createImage(UUID.randomUUID().toString, Handout()),
    createImage(UUID.randomUUID().toString, StaffPhotographer("Yellow Giraffe", "The Guardian")),
    createImage(UUID.randomUUID().toString, Handout(), usages = List(createDigitalUsage())),

    // with user metadata
    createImage(id = "test-image-13-edited", Handout()).copy(
      userMetadata = Some(Edits(metadata = ImageMetadata(credit = Some("author")))),
      uploadTime = DateTime.now.minusDays(25)
    ),

    createImage(id = "test-image-14-unedited", Handout()).copy(
      uploadTime = DateTime.now.minusDays(25)
    ),

    // with fileMetadata
    createImage(
      id = "test-image-8",
      staffPhotographer,
      fileMetadata = Some(FileMetadata(xmp = Map(
        "foo" -> "bar",
        "toolong" -> stringLongerThan(100000)
      )))
    )
  )

  val images: Seq[Image] =
    standardImages ++
    imagesSentForSyndication ++
    imagesQueuedForSyndication ++
    imagesForSyndicationReview ++
    imagesBlockedForSyndication ++
    imagesUnavailableForSyndication
}
