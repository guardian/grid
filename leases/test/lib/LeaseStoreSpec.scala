package lib

import com.gu.mediaservice.model.leases.{AllowUseLease, MediaLease}
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.BeforeAndAfterAll
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatestplus.mockito.MockitoSugar
import org.testcontainers.containers.localstack.LocalStackContainer
import org.testcontainers.containers.localstack.LocalStackContainer.Service.DYNAMODB
import org.testcontainers.utility.DockerImageName
import software.amazon.awssdk.auth.credentials.{AwsBasicCredentials, StaticCredentialsProvider}
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient
import software.amazon.awssdk.services.dynamodb.model._

import java.util.UUID
import scala.concurrent.ExecutionContext.Implicits.global
import scala.jdk.CollectionConverters._

class LeaseStoreSpec extends AnyFunSpec with Matchers with ScalaFutures with BeforeAndAfterAll with MockitoSugar {

  implicit val defaultPatience: PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(100, Millis))

  private val dynamoContainer = new LocalStackContainer(DockerImageName.parse("localstack/localstack:1.4.0")).withServices(DYNAMODB)
  dynamoContainer.start()

  private val dynamoClient = DynamoDbAsyncClient.builder().
    endpointOverride(dynamoContainer.getEndpointOverride(DYNAMODB)).
    region(Region.of(dynamoContainer.getRegion)).
    credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(dynamoContainer.getAccessKey, dynamoContainer.getSecretKey))).build()

  private val leasesTable = "test-leases-table-" + UUID.randomUUID().toString

  private val store = new LeaseStore(leasesTable, dynamoClient)

  override def beforeAll(): Unit = {
    def createTableRequestFor(tableName: String): CreateTableRequest = {
      val attributeDefinitions = List(
        AttributeDefinition.builder.attributeName("id").attributeType(ScalarAttributeType.S).build(),
        AttributeDefinition.builder.attributeName("mediaId").attributeType(ScalarAttributeType.S).build()
      )
      val keySchema = List(
        KeySchemaElement.builder.attributeName("id").keyType(KeyType.HASH).build()
      )
      val globalSecondaryIndexes = List(
        GlobalSecondaryIndex.builder()
          .indexName("mediaId")
          .keySchema(KeySchemaElement.builder().attributeName("mediaId").keyType(KeyType.HASH).build())
          .projection(Projection.builder().projectionType(ProjectionType.ALL).build())
          .provisionedThroughput(ProvisionedThroughput.builder().readCapacityUnits(1L).writeCapacityUnits(1L).build())
          .build()
      )
      CreateTableRequest.builder
        .tableName(tableName)
        .attributeDefinitions(attributeDefinitions.asJava)
        .keySchema(keySchema.asJava)
        .globalSecondaryIndexes(globalSecondaryIndexes.asJava)
        .provisionedThroughput(ProvisionedThroughput.builder.readCapacityUnits(1L).writeCapacityUnits(1L).build())
        .build()
    }

    dynamoClient.createTable(createTableRequestFor(leasesTable)).get()
  }

  override def afterAll(): Unit = {
    super.afterAll()
    dynamoContainer.stop()
  }

  describe("LeaseStore") {
    val now = DateTime.now.withZone(DateTimeZone.UTC)
    val lease = MediaLease(
      id = Some(UUID.randomUUID().toString),
      mediaId = "media-id-1",
      leasedBy = Some("test"),
      notes = Some("test notes"),
      access = AllowUseLease,
      createdAt = now
    )

    it("should be able to add a lease") {
      val eventualResult = store.put(lease)
      whenReady(eventualResult) { _ =>
        val readBack = store.get(lease.id.get)
        whenReady(readBack) { result =>
          result should equal(Some(lease))
        }
      }
    }

    it("should be able to get a lease for a media id") {
      val lease2 = lease.copy(id = Some(UUID.randomUUID().toString), mediaId = "media-id-2")
      val eventualResult = store.put(lease2)
      whenReady(eventualResult) { _ =>
        val readBack = store.getForMedia("media-id-2")
        whenReady(readBack) { result =>
          result should be(List(lease2))
        }
      }
    }

    it("should be able to get all leases") {
      val lease3 = lease.copy(id = Some(UUID.randomUUID().toString))
      val lease4 = lease.copy(id = Some(UUID.randomUUID().toString))
      val eventualResult = store.putAll(List(lease3, lease4))

      whenReady(eventualResult) { _ =>
        val readBack = store.forEach(identity)
        whenReady(readBack) { result =>
          result should contain allOf(lease3, lease4)
        }
      }
    }

    it("should be able to delete a lease") {
      val lease5 = lease.copy(id = Some(UUID.randomUUID().toString))
      val eventualResult = store.put(lease5)

      whenReady(eventualResult) { _ =>
        val readBack = store.get(lease5.id.get)
        whenReady(readBack) { result =>
          result should be(Some(lease5))
        }

        val deleteResult = store.delete(lease5.id.get)
        whenReady(deleteResult) { _ =>
          val readBackAfterDelete = store.get(lease5.id.get)
          whenReady(readBackAfterDelete) { result =>
            result should be(None)
          }
        }
      }
    }
  }
}
