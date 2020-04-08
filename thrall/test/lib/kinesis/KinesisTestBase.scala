package lib.kinesis

import org.scalatest.{BeforeAndAfterAll, FunSpec, Matchers}
import com.whisk.docker.impl.spotify.DockerKitSpotify
import com.whisk.docker.scalatest.DockerTestKit
import com.whisk.docker.{DockerContainer, DockerKit, DockerReadyChecker}
import com.gu.mediaservice.model._
import org.scalatest.time.{Second, Seconds, Span}

import lib.KinesisReceiverConfig
import org.mockito.Mockito
import org.scalatest.mockito.MockitoSugar
import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.services.kinesis.AmazonKinesis
import com.amazonaws.services.kinesis.AmazonKinesisClientBuilder
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.kinesis.model.CreateStreamRequest
import com.amazonaws.ClientConfiguration
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.internal.StaticCredentialsProvider
import org.apache.http.impl.client.BasicCredentialsProvider
import com.amazonaws.auth.AWSStaticCredentialsProvider
import com.amazonaws.auth.AWSCredentials
import com.amazonaws.auth.BasicAWSCredentials
import com.amazonaws.services.dynamodbv2.model.ListStreamsRequest

import scala.collection.JavaConverters._
import scala.concurrent.duration._
import scala.util.Properties
import scala.concurrent.{Await, Future}
import com.gu.mediaservice.lib.aws.ThrallMessageSender
import com.gu.mediaservice.lib.aws.KinesisSenderConfig
import com.amazonaws.services.kinesis.clientlibrary.lib.worker.KinesisClientLibConfiguration

trait KinesisTestBase extends FunSpec with BeforeAndAfterAll with Matchers with DockerKit with DockerTestKit with DockerKitSpotify with MockitoSugar {
  val highPriorityStreamName = "thrall-test-stream-high-priority"
  val lowPriorityStreamName = "thrall-test-stream-low-priority"
  val streamNames = List(highPriorityStreamName, lowPriorityStreamName)
  val region = "eu-west-1"
  val staticCredentials = new AWSStaticCredentialsProvider(new BasicAWSCredentials("stub", "creds"))

  private val kinesisPort = 4568
  private val dynamoDbPort = 4569
  private val webUiPort = 5050

  private val kinesisEndpoint = s"http://localhost:$kinesisPort"
  private val dynamoDbEndpoint = s"http://localhost:$dynamoDbPort"

  private val localstackVersion = "0.10.8"
  private val localstackContainer = DockerContainer(s"localstack/localstack:$localstackVersion")
    .withPorts(kinesisPort -> Some(kinesisPort), dynamoDbPort -> Some(dynamoDbPort), webUiPort -> Some(webUiPort))
    .withEnv(
      s"SERVICES=kinesis:$kinesisPort,dynamodb:$dynamoDbPort",
      s"PORT_WEB_UI=$webUiPort",
      s"DEFAULT_REGION=$region",
      "KINESIS_ERROR_PROBABILITY=0.0"
    )
    .withReadyChecker(
      DockerReadyChecker.HttpResponseCode(webUiPort, "health").within(1.minutes).looped(40, 1250.millis)
    )

  final override val StartContainersTimeout = 1.minute

  final override def dockerContainers: List[DockerContainer] = localstackContainer :: super.dockerContainers

  private def createKinesisClient(): AmazonKinesis = {
    val clientBuilder = AmazonKinesisClientBuilder.standard()
    clientBuilder.setCredentials(staticCredentials)
    clientBuilder.setEndpointConfiguration(new EndpointConfiguration(kinesisEndpoint, region))
    clientBuilder.build()
  }

  private def createStream(client: AmazonKinesis, name: String) = {
    val createStreamRequest = new CreateStreamRequest()
    createStreamRequest.setStreamName(name)
    createStreamRequest.setShardCount(1)
    client.createStream(createStreamRequest)
  }

  private def ensureStreamExistsAndIsActive(client: AmazonKinesis, streamNames: List[String]) = {
    val streamListResult = client.listStreams()
    streamNames.forall(streamName =>
      streamListResult.getStreamNames.contains(streamName) &&
        client.describeStream(streamName).getStreamDescription.getStreamStatus == "ACTIVE")
  }

  private def checkStreams(client: AmazonKinesis): Boolean = {
    if (ensureStreamExistsAndIsActive(client, streamNames)) {
      true
    } else {
      Thread.sleep(1000)
      checkStreams(client)
    }
  }

  override def beforeAll {
    super.beforeAll()
    Await.ready(localstackContainer.isReady(), 1.minute)

    val client = createKinesisClient()
    createStream(client, highPriorityStreamName)
    createStream(client, lowPriorityStreamName)

    val streamNames = client.listStreams().getStreamNames.asScala
    assert(streamNames.contains(highPriorityStreamName))
    assert(streamNames.contains(lowPriorityStreamName))

    // We must wait for the stream to be ready – see https://github.com/localstack/localstack/issues/231
    Await.result(Future { checkStreams(client) }, 10.seconds)

    println(s"Local kinesis streams are ready: ${streamNames.mkString(",")}")
  }

  def getSenderConfig(streamName: String): ThrallMessageSender = new ThrallMessageSender(
    KinesisSenderConfig(region, staticCredentials, kinesisEndpoint, streamName)
  )

  def getReceiverConfig(streamName: String): KinesisClientLibConfiguration  = {
    val config = new KinesisReceiverConfig(
      streamName,
      None,
      kinesisEndpoint,
      dynamoDbEndpoint,
      region,
      staticCredentials
    )
    KinesisConfig.kinesisConfig(config)
  }
}
