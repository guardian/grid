package lib

import com.amazonaws.auth.{AWSStaticCredentialsProvider, BasicAWSCredentials}
import com.amazonaws.client.builder.AwsClientBuilder
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBAsyncClientBuilder
import com.gu.mediaservice.model.{Edits, ImageMetadata}
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

import java.util.UUID
import scala.concurrent.ExecutionContext.Implicits.global
import scala.jdk.CollectionConverters._

class EditsStoreTest extends AnyFunSpec with Matchers with ScalaFutures with BeforeAndAfterAll {

  implicit val defaultPatience: PatienceConfig = PatienceConfig(timeout = Span(5, Seconds), interval = Span(100, Millis))

  private val dynamoContainer = new LocalStackContainer(DockerImageName.parse("localstack/localstack:1.4.0")).withServices(DYNAMODB)
  dynamoContainer.start()

  val testTableName: String = "test-edits-table-" + UUID.randomUUID().toString

  private val dynamoClient = AmazonDynamoDBAsyncClientBuilder.standard().
    withEndpointConfiguration(new AwsClientBuilder.EndpointConfiguration(dynamoContainer.getEndpoint.toURL.toExternalForm, dynamoContainer.getRegion)).
    withCredentials(new AWSStaticCredentialsProvider(new BasicAWSCredentials(dynamoContainer.getAccessKey, dynamoContainer.getSecretKey))).
    build()

  private val dynamoClient2: DynamoDbClient = DynamoDbClient.builder().
    endpointOverride(dynamoContainer.getEndpointOverride(DYNAMODB)).
    region(Region.of(dynamoContainer.getRegion)).
    credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(dynamoContainer.getAccessKey, dynamoContainer.getSecretKey))).build()

  private val store = new EditsStore(dynamoClient, dynamoClient2, testTableName) {
  }

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

    dynamoClient2.createTable(createTableRequestFor(testTableName))
  }

  override def afterAll(): Unit = {
    super.afterAll()
    dynamoContainer.stop()
  }

  describe("EditsStore") {

    it("should fail with NoItemFound for a non-existent item in getV2") {
      val imageId = "non-existent-image"

      val eventualResult = store.getV2(imageId)

      whenReady(eventualResult.failed) { exception =>
        exception shouldBe com.gu.mediaservice.lib.aws.NoItemFound
      }
    }

    it("should persist a boolean property using V2") {
      val imageId = "test-image-for-boolean-get-v2"

      val eventualResult = store.booleanSetV2(imageId, Edits.Archived, value = true).flatMap { _ =>
        store.booleanGetV2(imageId, Edits.Archived)
      }

      whenReady(eventualResult) { result =>
        result should be(true)
      }
    }

    it("should fail with NoItemFound for a non-existent attribute in booleanGetV2") {
      val imageId = "test-image-for-boolean-get-v2-non-existent-attribute"

      // First, create the item so it exists
      store.booleanSetV2(imageId, Edits.Archived, value = true).futureValue

      val eventualResult = store.booleanGetV2(imageId, "another-existent-attribute")

      whenReady(eventualResult.failed) { exception =>
        exception shouldBe com.gu.mediaservice.lib.aws.NoItemFound
      }
    }

    it("should get a previously persisted property using V2") {
      val imageId = "test-image-for-set-get-v2"
      val labels = List("label1", "label2")
      val eventualResult = store.setAddV2(imageId, Edits.Labels, labels).flatMap { _ =>
        store.setGetV2(imageId, Edits.Labels)
      }

      whenReady(eventualResult) { result =>
        result should be(labels.toSet)
      }
    }

    describe("setAddV2") {
      it("should add a value to a non-existent set, creating it") {
        val imageId = "test-image-for-set-add-non-existent"
        val label = "label1"

        val eventualResult = store.setAddV2(imageId, Edits.Labels, List(label)).flatMap { _ =>
          store.setGetV2(imageId, Edits.Labels)
        }

        whenReady(eventualResult) { result =>
          result should be(Set(label))
        }
      }

      it("should append a value to an existing set") {
        val imageId = "test-image-for-set-add-existing"
        val labels = List("label1", "label2")
        val newLabel = "label3"

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, labels)
          _ <- store.setAddV2(imageId, Edits.Labels, List(newLabel))
          result <- store.setGetV2(imageId, Edits.Labels)
        } yield result

        whenReady(eventualResult) { result =>
          result should be(Set("label1", "label2", "label3"))
        }
      }

      it("should not add a duplicate value to a set") {
        val imageId = "test-image-for-set-add-duplicate"
        val label = "label1"

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, List(label))
          _ <- store.setAddV2(imageId, Edits.Labels, List(label))
          result <- store.setGetV2(imageId, Edits.Labels)
        } yield result

        whenReady(eventualResult) { result =>
          result should be(Set(label))
        }
      }
    }

    describe("booleanSetOrRemoveV2") {
      it("should set a boolean property to true using V2") {
        val imageId = "test-image-for-boolean-set-or-remove-v2-set"
        val key = "testBoolean"

        val eventualResult = for {
          _ <- store.booleanSetOrRemoveV2(imageId, key, value = true)
          result <- store.booleanGetV2(imageId, key)
        } yield result

        whenReady(eventualResult) { result =>
          result should be(true)
        }
      }

      it("should remove a boolean property when setting to false using V2") {
        val imageId = "test-image-for-boolean-set-or-remove-v2-remove"
        val key = "testBoolean"

        val setup = for {
          _ <- store.booleanSetOrRemoveV2(imageId, key, value = true)
          _ <- store.booleanSetOrRemoveV2(imageId, key, value = false)
          result <- store.booleanGetV2(imageId, key).failed
        } yield result

        whenReady(setup) { exception =>
          exception shouldBe com.gu.mediaservice.lib.aws.NoItemFound
        }
      }
    }

    describe("removeKey") {
      it("should remove a key from an existing item") {
        val imageId = "test-image-for-remove-key"
        val labels = List("label1", "label2")
        val archived = true

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, labels)
          _ <- store.booleanSetV2(imageId, Edits.Archived, archived)
          _ <- store.removeKeyV2(imageId, Edits.Labels)
          result <- store.getV2(imageId)
        } yield result

        whenReady(eventualResult) { result =>
          val edits = result.as[Edits]
          edits.archived should be(archived)
          edits.labels should be(empty)
        }
      }

      it("should not fail when removing a non-existent key from an existing item") {
        val imageId = "test-image-for-remove-non-existent-key"
        val labels = List("label1", "label2")

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, labels)
          _ <- store.removeKeyV2(imageId, Edits.Archived)
          result <- store.getV2(imageId)
        } yield result

        whenReady(eventualResult) { result =>
          val edits = result.as[Edits]
          edits.labels.toSet should be(labels.toSet)
        }
      }

      it("will create an item when removing a key from a non-existent item") {
        // TODO should this really be happening?
        val imageId = "non-existent-image-for-remove-key"

        val eventualResult = for {
          _ <- store.removeKeyV2(imageId, Edits.Labels)
          result <- store.getV2(imageId)
        } yield result

        whenReady(eventualResult) { result =>
          val edits = result.as[Edits]
          edits.labels should be(empty)
          edits.metadata should be(ImageMetadata.empty)
        }
      }
    }

    describe("setDelete") {
      it("should delete an item from a set") {
        val imageId = "test-image-for-set-delete"
        val labels = List("label1", "label2", "label3")
        val labelToDelete = "label2"

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, labels)
          _ <- store.setDeleteV2(imageId, Edits.Labels, labelToDelete)
          result <- store.setGetV2(imageId, Edits.Labels)
        } yield result

        whenReady(eventualResult) { result =>
          result should be(Set("label1", "label3"))
        }
      }

      it("should leave an empty set when deleting the last item from a set") {
        val imageId = "test-image-for-set-delete-last-item"
        val label = "label1"

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, List(label))
          _ <- store.setDeleteV2(imageId, Edits.Labels, label)
          result <- store.getV2(imageId)
        } yield result

        whenReady(eventualResult) { result =>
          // After deleting the last item, the key (labels) should be removed.
          // leaving an empty set rather than a missing key
          val edits = result.as[Edits]
          edits.labels should be(empty)
        }
      }

      it("should not fail when deleting a non-existent item from a set") {
        val imageId = "test-image-for-set-delete-non-existent-item"
        val labels = List("label1", "label2")
        val labelToDelete = "label3"

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, labels)
          _ <- store.setDeleteV2(imageId, Edits.Labels, labelToDelete)
          result <- store.setGetV2(imageId, Edits.Labels)
        } yield result

        whenReady(eventualResult) { result =>
          result should be(Set("label1", "label2"))
        }
      }
    }

    describe("deleteItemV2") {
      it("should delete an existing item") {
        val imageId = "test-image-for-delete-item-v2"
        val labels = List("label1", "label2")

        val eventualResult = for {
          _ <- store.setAddV2(imageId, Edits.Labels, labels)
          _ <- store.deleteItemV2(imageId)
          result <- store.getV2(imageId).failed
        } yield result

        whenReady(eventualResult) { exception =>
          exception shouldBe com.gu.mediaservice.lib.aws.NoItemFound
        }
      }

      it("should not fail when deleting a non-existent item") {
        val imageId = "non-existent-image-for-delete-item-v2"

        val eventualResult = store.deleteItemV2(imageId)

        whenReady(eventualResult) { result =>
          result should be(())
        }
      }
    }
  }
}
