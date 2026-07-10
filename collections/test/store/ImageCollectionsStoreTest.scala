package store

import com.gu.mediaservice.model.{ActionData, Collection}
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
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient
import software.amazon.awssdk.services.dynamodb.model._

import java.util.UUID
import scala.jdk.CollectionConverters._

class ImageCollectionsStoreTest extends AnyFunSpec with Matchers with ScalaFutures with BeforeAndAfterAll {

  implicit val defaultPatience: PatienceConfig = PatienceConfig(timeout = Span(5, Seconds), interval = Span(500, Millis))

  private val dynamoContainer = new LocalStackContainer(DockerImageName.parse("localstack/localstack:1.4.0")).withServices(DYNAMODB)
  dynamoContainer.start()

  private val dynamoClient = DynamoDbAsyncClient.builder().
    endpointOverride(dynamoContainer.getEndpointOverride(DYNAMODB)).
    region(Region.of(dynamoContainer.getRegion)).
    credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(dynamoContainer.getAccessKey, dynamoContainer.getSecretKey))).build()

  private val imageCollectionsTable = "test-image-collections-table-" + UUID.randomUUID().toString
  private val store = new ImageCollectionsStore(imageCollectionsTable, dynamoClient)

  override def beforeAll(): Unit = {
    val attributeDefinitions = List(
      AttributeDefinition.builder.attributeName("id").attributeType(ScalarAttributeType.S).build()
    )
    val keySchema = List(
      KeySchemaElement.builder.attributeName("id").keyType(KeyType.HASH).build()
    )
    val provisionedThroughput = ProvisionedThroughput.builder.readCapacityUnits(1L).writeCapacityUnits(1L).build()
    val request = CreateTableRequest.builder
      .tableName(imageCollectionsTable)
      .attributeDefinitions(attributeDefinitions.asJava)
      .keySchema(keySchema.asJava)
      .provisionedThroughput(provisionedThroughput)
      .build()
    dynamoClient.createTable(request).get()
  }

  override def afterAll(): Unit = {
    super.afterAll()
    dynamoContainer.stop()
  }

  describe("ImageCollectionsStore") {
    val imageId = "test-image-id"
    val collection1 = Collection(List("a", "b"), ActionData("author", DateTime.now()), "description 1")
    val collection2 = Collection(List("c", "d"), ActionData("author", DateTime.now()), "description 2")

    it("should be able to add image to a collection") {
      val eventualAddedResponse = store.add(imageId, collection1)
      whenReady(eventualAddedResponse) { response =>
        response.size should be(1)
        response.head.pathId should be("a/b")
      }

      // Read back
      val eventuallyReloaded = store.get(imageId)
      whenReady(eventuallyReloaded) { collections =>
        collections.size should be(1)
        collections.head.pathId should be("a/b")
      }

      // Add another collection
      whenReady(store.add(imageId, collection2)) { collections =>
        collections.size should be(2)
        collections.map(_.pathId) should contain allOf("a/b", "c/d")
      }

      whenReady(store.get(imageId)) { collections =>
        collections.size should be(2)
        collections.head.pathId should be("a/b")
        collections.last.pathId should be("c/d")
      }

      // Update to replace all for this image
      val newCollection = Collection(List("e", "f"), ActionData("new-author", DateTime.now()), "new description")
      val eventuallyUpdated = store.update(imageId, List(newCollection))
      whenReady(eventuallyUpdated) { collections =>
        collections.size should be(1)
        collections.head.pathId should be("e/f")
      }

      whenReady(store.get(imageId)) { collections =>
        collections.size should be(1)
        collections.head.pathId should be("e/f")
      }
    }
  }
}
