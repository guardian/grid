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
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.jdk.CollectionConverters._


class CollectionsStoreTest extends AnyFunSpec with Matchers with ScalaFutures with BeforeAndAfterAll {

  implicit val defaultPatience: PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(100, Millis))

  private val dynamoContainer = new LocalStackContainer(DockerImageName.parse("localstack/localstack:1.4.0")).withServices(DYNAMODB)
  dynamoContainer.start()

  private val dynamoClient = DynamoDbAsyncClient.builder().
    endpointOverride(dynamoContainer.getEndpointOverride(DYNAMODB)).
    region(Region.of(dynamoContainer.getRegion)).
    credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(dynamoContainer.getAccessKey, dynamoContainer.getSecretKey))).build()

  private val collectionsTable = "test-collections-table-" + UUID.randomUUID().toString
  private val collectionsTableForAllTest = "test-collections-table-" + UUID.randomUUID().toString
  private val store = new CollectionsStore(collectionsTable, dynamoClient)
  private val storeForAllTest = new CollectionsStore(collectionsTableForAllTest, dynamoClient)

  override def beforeAll(): Unit = {
    def createTableRequestFor(tableName: String): CreateTableRequest = {
      val attributeDefinitions = List(
        AttributeDefinition.builder.attributeName("id").attributeType(ScalarAttributeType.S).build()
      )
      val keySchema = List(
        KeySchemaElement.builder.attributeName("id").keyType(KeyType.HASH).build()
      )
      val provisionedThroughput = ProvisionedThroughput.builder.readCapacityUnits(1L).writeCapacityUnits(1L).build()
      val request = CreateTableRequest.builder
        .tableName(tableName)
        .attributeDefinitions(attributeDefinitions.asJava)
        .keySchema(keySchema.asJava)
        .provisionedThroughput(provisionedThroughput)
        .build()
      request
    }

    dynamoClient.createTable(createTableRequestFor(collectionsTable)).get()
    dynamoClient.createTable(createTableRequestFor(collectionsTableForAllTest)).get()
  }

  override def afterAll(): Unit = {
    super.afterAll()
    dynamoContainer.stop()
  }

  describe("CollectionsStore") {
    val collection = Collection(List("a", "b"), ActionData("author", DateTime.now()), "description")

    it("should be able to add a collection") {
      val eventualResult = store.add(collection)
      whenReady(eventualResult) { c =>
        c.pathId should be("a/b")
        c.description should be("description")
      }
    }

    it("should be able to get a collection") {
      val eventualResult = store.get(List("a", "b"))
      whenReady(eventualResult) { c =>
        c.get.pathId should be("a/b")
        c.get.description should be("description")
      }
    }

    it("should be able to get all collections") {
      val collection1 = Collection(List("e", "f"), ActionData("author1", DateTime.now()), "description1")
      val collection2 = Collection(List("g", "h"), ActionData("author2", DateTime.now()), "description2")

      val eventualAdded = Future.sequence(Seq(storeForAllTest.add(collection1), storeForAllTest.add(collection2)))

      val eventualResult = eventualAdded.flatMap(_ => storeForAllTest.getAll)

      whenReady(eventualResult) { collections =>
        collections.size should be(2)
        collections.map(_.pathId) should contain allOf("e/f", "g/h")
      }
    }

    it("should be able to remove a collection") {
      val eventualResult = store.remove(List("a", "b")).flatMap(_ => store.get(List("a", "b")))
      whenReady(eventualResult) { c =>
        c should be(None)
      }

      val eventualReadback = store.get(List("a", "b"))
      whenReady(eventualReadback) { r =>
        r should be(None)
      }
    }
  }
}
