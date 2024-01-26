package lib.elasticsearch

import java.util.UUID
import com.gu.mediaservice.model._
import org.joda.time.DateTime
import org.scalatest.concurrent.PatienceConfiguration.{Interval, Timeout}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.time.{Milliseconds, Seconds, Span}
import org.scalatest.BeforeAndAfterAll
import org.scalatest.matchers.should.Matchers
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.elasticsearch.ElasticsearchContainer
import play.api.libs.json.JsString

import java.util.concurrent.atomic.AtomicReference
import scala.util.Properties
import scala.concurrent.duration._
import scala.compat.java8.DurationConverters._
import scala.jdk.CollectionConverters._


trait ElasticSearchTestBase extends AnyFunSpec with BeforeAndAfterAll with Matchers with ScalaFutures with Fixtures with ConditionFixtures {

  val interval = Interval(Span(100, Milliseconds))
  val timeout = Timeout(Span(10, Seconds))

  val useEsDocker = Properties.envOrElse("USE_DOCKER_FOR_TESTS", "true").toBoolean

  val esContainer: Option[ElasticsearchContainer] = if (useEsDocker) {
    {
      val container = new ElasticsearchContainer("docker.elastic.co/elasticsearch/elasticsearch:7.16.2")
        .withExposedPorts(9200)
        .withAccessToHost(true)
        .withEnv(Map(
          "cluster.name" -> "media-service",
          "xpack.security.enabled" -> "false",
          "discovery.type" -> "single-node",
          "network.host" -> "0.0.0.0"
        ).asJava)
        .waitingFor(Wait.forHttp("/")
          .forPort(9200)
          .forStatusCode(200)
          .withStartupTimeout(180.seconds.toJava)
        )
      container.start()
      Some(container)
    }
  } else None

  val esPort = esContainer.map(_.getMappedPort(9200)).getOrElse(9200)
  val es6TestUrl = Properties.envOrElse("ES6_TEST_URL", s"http://localhost:$esPort")

  override protected def afterAll(): Unit = {
    super.afterAll()

    esContainer foreach { _.stop() }
  }

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
      fileMetadata = Some(FileMetadata(
        iptc = Map(
          "Caption/Abstract" -> "the description",
          "Caption Writer/Editor" -> "the editor"
        ),
        exif = Map(
          "Copyright" -> "the copyright",
          "Artist" -> "the artist"
        ),
        xmp = Map(
        "foo" -> JsString("bar"),
        "toolong" -> JsString(stringLongerThan(100000)),
        "org:ProgrammeMaker" -> JsString("xmp programme maker"),
        "aux:Lens" -> JsString("xmp aux lens")
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
