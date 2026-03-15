package model

import com.amazonaws.auth.{AWSStaticCredentialsProvider, BasicAWSCredentials}
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.dynamodbv2.{AmazonDynamoDBAsync, AmazonDynamoDBAsyncClientBuilder}
import com.gu.mediaservice.lib.logging.{GridLogging, MarkerMap}
import com.gu.mediaservice.model.usage._
import lib.WithLogMarker
import org.joda.time.DateTime
import org.scalatest.BeforeAndAfterAll
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Millis, Seconds, Span}
import org.testcontainers.containers.localstack.LocalStackContainer
import org.testcontainers.containers.localstack.LocalStackContainer.Service.DYNAMODB
import org.testcontainers.utility.DockerImageName
import software.amazon.awssdk.auth.credentials.{AwsBasicCredentials, StaticCredentialsProvider}
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model._

import java.net.URI
import java.util.UUID
import scala.concurrent.Await
import scala.concurrent.duration._
import scala.jdk.CollectionConverters._

class UsageTableTest extends AnyFunSpec with Matchers with GridLogging with ScalaFutures with BeforeAndAfterAll {

  implicit val defaultPatience: PatienceConfig = PatienceConfig(timeout = Span(5, Seconds), interval = Span(500, Millis))
  private val tenSeconds = 10.seconds

  private val dynamoContainer = new LocalStackContainer(
    DockerImageName.parse("localstack/localstack:1.4.0")
  ).withServices(DYNAMODB)
  dynamoContainer.start()

  private val dynamoClientV1: AmazonDynamoDBAsync = AmazonDynamoDBAsyncClientBuilder.standard()
    .withEndpointConfiguration(new EndpointConfiguration(
      dynamoContainer.getEndpointOverride(DYNAMODB).toString,
      dynamoContainer.getRegion
    ))
    .withCredentials(new AWSStaticCredentialsProvider(new BasicAWSCredentials(
      dynamoContainer.getAccessKey,
      dynamoContainer.getSecretKey
    )))
    .build()

  private val dynamoClientV2: DynamoDbClient = DynamoDbClient.builder()
    .endpointOverride(dynamoContainer.getEndpointOverride(DYNAMODB))
    .region(Region.of(dynamoContainer.getRegion))
    .credentialsProvider(StaticCredentialsProvider.create(
      AwsBasicCredentials.create(dynamoContainer.getAccessKey, dynamoContainer.getSecretKey)
    )).build()

  private val usageTable = "test-usage-table-" + UUID.randomUUID().toString
  private val store = new UsageTable(dynamoClientV1, dynamoClientV2, usageTable)

  override def beforeAll(): Unit = {
    val attributeDefinitions = List(
      AttributeDefinition.builder.attributeName("grouping").attributeType(ScalarAttributeType.S).build(),
      AttributeDefinition.builder.attributeName("usage_id").attributeType(ScalarAttributeType.S).build(),
      AttributeDefinition.builder.attributeName("media_id").attributeType(ScalarAttributeType.S).build()
    )
    val keySchema = List(
      KeySchemaElement.builder.attributeName("grouping").keyType(KeyType.HASH).build(),
      KeySchemaElement.builder.attributeName("usage_id").keyType(KeyType.RANGE).build()
    )
    val provisionedThroughput = ProvisionedThroughput.builder.readCapacityUnits(1L).writeCapacityUnits(1L).build()

    val imageIndex = GlobalSecondaryIndex.builder()
      .indexName("media_id")
      .keySchema(KeySchemaElement.builder()
        .attributeName("media_id")
        .keyType(KeyType.HASH).build())
      .projection(Projection.builder().projectionType(ProjectionType.ALL).build())
      .provisionedThroughput(provisionedThroughput)
      .build()

    val request = CreateTableRequest.builder
      .tableName(usageTable)
      .attributeDefinitions(attributeDefinitions.asJava)
      .keySchema(keySchema.asJava)
      .globalSecondaryIndexes(imageIndex)
      .provisionedThroughput(provisionedThroughput)
      .build()
    dynamoClientV2.createTable(request)
  }

  override def afterAll(): Unit = {
    super.afterAll()
    dynamoContainer.stop()
  }

  describe("UsageTable") {
    it("should be able to query by image id") {
      val imageId1 = "test-image-id-1"
      val imageId2 = "test-image-id-2"

      val usageId1 = UsageId(UUID.randomUUID().toString)
      val usageId2 = UsageId(UUID.randomUUID().toString)

      val usage1 = MediaUsage(
        usageId1,
        s"grouping-${usageId1.toString}",
        imageId1,
        DigitalUsage,
        "image",
        PendingUsageStatus,
        None,
        None,
        None,
        None,
        None,
        DateTime.now()
      )
      val usage2 = MediaUsage(
        usageId2,
        s"grouping-${usageId2.toString}",
        imageId2,
        DigitalUsage,
        "image",
        PublishedUsageStatus,
        None,
        None,
        None,
        None,
        None,
        DateTime.now()
      )

      val eventualUsage1Created = store.create(usage1)(MarkerMap()).toList.toBlocking.toFuture
      val eventualUsage2Created = store.create(usage2)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsage1Created, tenSeconds)
      Await.result(eventualUsage2Created, tenSeconds)

      val eventualResult = store.queryByImageId(imageId1)(MarkerMap())

      whenReady(eventualResult) { result =>
        result.size should be(1)
        result.head.mediaId should be(imageId1)
      }
    }

    it("should be able to query by usage id") {
      val imageId = "test-image-id-for-by-usage-id-test"
      val usageId = UsageId(UUID.randomUUID().toString)
      val grouping = "some-grouping"

      val usage = MediaUsage(
        usageId,
        grouping,
        imageId,
        DigitalUsage,
        "image",
        PendingUsageStatus,
        Some(PrintUsageMetadata(
          sectionCode = "a-section",
          sectionName = "A section",
          pageNumber = 7,
          issueDate = DateTime.now,
          storyName = "a-story",
          publicationCode = "tst",
          publicationName = "Test publication",
          edition = Some(1)
        )
        ),
        Some(DigitalUsageMetadata(
          webUrl = new URI("http://localhost/test"),
          webTitle = "A page",
          sectionId = "a-section"
        )),
        Some(SyndicationUsageMetadata(
          partnerName = "Test Partner",
          syndicatedBy = Some("test-syndicator")
        )),
        Some(FrontUsageMetadata(
          addedBy = "test-user",
          front = "uk/culture"
        )),
        Some(DownloadUsageMetadata(
          downloadedBy = "test-downloader"
        )),
        DateTime.now()
      )

      val eventualUsage1Created = store.create(usage)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsage1Created, tenSeconds)

      val eventualResult = store.queryByUsageId(s"${grouping}_${usageId.id}")

      whenReady(eventualResult) { result =>
        result.get.usageId should be(usageId)
        result.get should be(usage)
      }
    }

    it("should be able to delete a record") {
      val imageId = "test-image-id-for-delete-test"
      val usageId = UsageId(UUID.randomUUID().toString)
      val grouping = "some-grouping-for-delete"

      val usage = MediaUsage(
        usageId,
        grouping,
        imageId,
        DigitalUsage,
        "image",
        PendingUsageStatus,
        None,
        None,
        None,
        None,
        None,
        DateTime.now()
      )
      val eventualUsageCreated = store.create(usage)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsageCreated, tenSeconds)
      val eventualReadbackResult = store.queryByUsageId(s"${grouping}_${usageId.id}")
      whenReady(eventualReadbackResult) { result =>
        result should be(Some(usage))
      }

      store.deleteRecord(usage)(MarkerMap())

      val eventualReadbackAfterDelete = store.queryByUsageId(s"${grouping}_${usageId.id}")
      whenReady(eventualReadbackAfterDelete) { result =>
        result should be(None)
      }
    }

    it("should be able to update a record") {
      val imageId = "test-image-id-for-update-test"
      val usageId = UsageId(UUID.randomUUID().toString)
      val grouping = "some-grouping-for-update"

      val usage = MediaUsage(
        usageId,
        grouping,
        imageId,
        DigitalUsage,
        "image",
        PendingUsageStatus,
        None,
        None,
        None,
        None,
        None,
        DateTime.now()
      )
      val eventualUsageCreated = store.create(usage)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsageCreated, tenSeconds)
      val updatedUsage = usage.copy(status = PublishedUsageStatus)

      val eventualUsageUpdated = store.update(updatedUsage)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsageUpdated, tenSeconds)

      val eventualReadbackResult = store.queryByUsageId(s"${grouping}_${usageId.id}")
      whenReady(eventualReadbackResult) { result =>
        result.get.status should be(PublishedUsageStatus)
      }
    }

    it("should be able to mark a record as removed") {
      val imageId = "test-image-id-for-mark-as-removed-test"
      val usageId = UsageId(UUID.randomUUID().toString)
      val grouping = "some-grouping-for-mark-as-removed"

      val usage = MediaUsage(
        usageId,
        grouping,
        imageId,
        DigitalUsage,
        "image",
        PendingUsageStatus,
        None,
        None,
        None,
        None,
        None,
        DateTime.now()
      )
      val eventualUsageCreated = store.create(usage)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsageCreated, tenSeconds)

      val eventualUsageMarkedAsRemoved = store.markAsRemoved(usage)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsageMarkedAsRemoved, tenSeconds)

      val eventualReadbackResult = store.queryByUsageId(s"${grouping}_${usageId.id}")
      whenReady(eventualReadbackResult) { result =>
        result.get.isRemoved should be(true)
      }
    }

    it("should be able to match a usage group") {
      // TODO unclear what this means
      val imageId = "test-image-id-for-match-usage-group-test"
      val usageId = UsageId(UUID.randomUUID().toString)
      val grouping = "some-grouping-for-match-usage-group"

      val usage = MediaUsage(
        usageId,
        grouping,
        imageId,
        DigitalUsage,
        "image",
        PendingUsageStatus,
        None,
        None,
        None,
        None,
        None,
        DateTime.now()
      )

      val eventualUsageCreated = store.create(usage)(MarkerMap()).toList.toBlocking.toFuture
      Await.result(eventualUsageCreated, tenSeconds)

      val usageGroup = UsageGroup(
        usages = Set(usage),
        grouping = grouping,
        lastModified = DateTime.now
      )

      implicit val logMarker: MarkerMap = MarkerMap()
      val eventualResult = store.matchUsageGroup(WithLogMarker(usageGroup)).toList.toBlocking.toFuture

      whenReady(eventualResult) { result =>
        result.head.value should be(Set(usage))
      }
    }
  }
}
