package lib.kinesis

import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}
import com.whisk.docker.impl.spotify.DockerKitSpotify
import com.whisk.docker.scalatest.DockerTestKit
import com.whisk.docker.{DockerContainer, DockerKit, DockerReadyChecker}
import com.gu.mediaservice.model._
import org.scalatest.time.{Second, Seconds, Span}

import scala.concurrent.duration._
import scala.util.Properties
import scala.concurrent.{Await, Future}

trait KinesisTestBase extends FunSpec with BeforeAndAfterAll with Matchers with DockerKit with DockerTestKit with DockerKitSpotify {
  val kinesisTestUrl = Properties.envOrElse("KINESIS_TEST_URL", "http://localhost:4566")
  val kinesisPort = 4566
  val webUiPort = 5050
  val kinesisImage = "localstack/localstack:0.11.0"
  val kinesisContainer = DockerContainer(kinesisImage)
    .withPorts(kinesisPort -> Some(kinesisPort), webUiPort -> Some(webUiPort))
    .withEnv(s"PORT_WEB_UI=$webUiPort")
    .withReadyChecker(
      DockerReadyChecker.HttpResponseCode(webUiPort, "health").within(1.minutes).looped(40, 1250.millis)
    )

  final override val StartContainersTimeout = 1.minute

  final override def dockerContainers: List[DockerContainer] =
    kinesisContainer :: super.dockerContainers

  override def beforeAll {
    super.beforeAll()
    Await.ready(kinesisContainer.isReady(), 1.minute)
    println("Local kinesis image is ready")
  }
}

