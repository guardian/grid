package lib.elasticsearch

import java.util.UUID

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model._
import com.whisk.docker.impl.spotify.DockerKitSpotify
import com.whisk.docker.scalatest.DockerTestKit
import com.whisk.docker.{DockerContainer, DockerKit}
import org.joda.time.DateTime
import org.scalatest.concurrent.PatienceConfiguration.{Interval, Timeout}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Milliseconds, Seconds, Span}
import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}
import play.api.libs.json.JsString

import scala.concurrent.duration._
import scala.util.Properties

trait ElasticSearchTestBase extends FunSpec with BeforeAndAfterAll with Matchers with ScalaFutures with Fixtures with DockerKit with DockerTestKit with DockerKitSpotify with ConditionFixtures {


  val interval = Interval(Span(100, Milliseconds))
  val timeout = Timeout(Span(10, Seconds))

  val useEsDocker = Properties.envOrElse("USE_DOCKER_FOR_TESTS", "true").toBoolean
  val es6TestUrl = Properties.envOrElse("ES6_TEST_URL", "http://localhost:9200")

  def esContainer: Option[DockerContainer]

  final override def dockerContainers: List[DockerContainer] =
    esContainer.toList ++ super.dockerContainers

  final override val StartContainersTimeout = 1.minute

  lazy val images = Seq(
    createImage("getty-image-1", Agency("Getty Images")),
    createImage("getty-image-2", Agency("Getty Images")),
    createImage("ap-image-1", Agency("AP")),
    createImage("gnm-image-1", Agency("GNM")),
    createImage(UUID.randomUUID().toString, Handout()),
    createImage("iron-suit", CommissionedPhotographer("Iron Man")),
    createImage("green-giant", StaffIllustrator("Hulk")),
    createImage("hammer-hammer-hammer", ContractIllustrator("Thor")),
    createImage("green-leaf", StaffPhotographer("Yellow Giraffe", "The Guardian")),
    createImage(UUID.randomUUID().toString, Handout(), usages = List(createDigitalUsage())),

    createImageUploadedInThePast("persisted-because-edited").copy(
      userMetadata = Some(Edits(metadata = ImageMetadata(credit = Some("author"))))
    ),

    createImageUploadedInThePast("test-image-14-unedited"),

    createImageUploadedInThePast("persisted-because-usage").copy(
      usages = List(createPrintUsage())
    ),

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
        "foo" -> JsString("bar"),
        "toolong" -> JsString(stringLongerThan(100000))
      )))
    ),

    // no rights acquired, not available for syndication
    createImageForSyndication("test-image-13", rightsAcquired = false, None, None),

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
    ),

    // TODO this test image *should* be in `AwaitingReviewForSyndication` but instead its in `BlockedForSyndication`
    // see https://www.elastic.co/guide/en/elasticsearch/reference/current/nested.html to understand why
    //    createImageForSyndication(
    //      id = "active-deny-syndication-with-expired-crop",
    //      rightsAcquired = true,
    //      Some(DateTime.parse("2018-01-01T00:00:00")),
    //      None
    //    ).copy(
    //      leases =  LeasesByMedia(
    //        lastModified = None,
    //        leases = List(
    //          createLease(
    //            DenySyndicationLease,
    //            imageId = "syndication-review-foo"
    //          ),
    //          createLease(
    //            AllowUseLease,
    //            imageId = "syndication-review-foo",
    //            endDate = Some(DateTime.now().minusDays(100))
    //          )
    //        )
    //      )
    //    )
  )
}
