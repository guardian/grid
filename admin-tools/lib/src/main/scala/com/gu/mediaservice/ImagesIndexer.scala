package com.gu.mediaservice

import java.net.URL
import java.util.UUID

import com.amazonaws.auth._
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.{ObjectMetadata, Region}
import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.bulk.BulkResponse
import com.sksamuel.elastic4s.http.{ElasticClient, ElasticProperties, Response}
import play.api.libs.json.Json

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success}

object ImagesIndexer {

  private val apiKey = "dev-"
  val domainRoot = "local.dev-gutools.co.uk"
  private val projectionBaseEndpoint = "https://admin-tools.media.local.dev-gutools.co.uk/images/projection"
  private val esEndpoint = "http://localhost:9200"
  private val esIndex = "images/_doc"
  private val esClient = ElasticClient(ElasticProperties(esEndpoint))
  private val blobJsonsBucket = "media-service-admin-tools-dev"
  val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
  private val idmCfg = ImageDataMergerConfig(apiKey, services)

  def prepareBlobs(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val imageDataMerger = new ImageDataMerger(idmCfg)
    Future.traverse(mediaIds) { id =>
      val projectionEndpoint = s"$projectionBaseEndpoint/$id"
      val reqUrl = new URL(projectionEndpoint)
      GridClient.makeGetRequestAsync(reqUrl, apiKey)
      imageDataMerger.getMergedImageData(id)
    }.map(_.flatten.map(i => Json.stringify(Json.toJson(i))))
    //      .map(l => l.filter(_.statusCode == 200).map(res => Json.stringify(res.body)))
  }

  private def s3client = {
    lazy val awsCredentials = new AWSCredentialsProviderChain(
      new ProfileCredentialsProvider("media-service"),
      InstanceProfileCredentialsProvider.getInstance()
    )
    AmazonS3ClientBuilder.standard()
      .withCredentials(awsCredentials)
      .withRegion(Region.EU_Ireland.toAWSRegion.getName)
      .build()
  }

  def storeImagesForBatchInsert(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[String]] = prepareBlobs(mediaIds)
    val images: List[String] = Await.result(blobsFuture, Duration.Inf)
    println(s"prepared json blobs list of size: ${images.size}")
    println("attempting to store blob to s3")
    val fileContent = images.mkString("\n")
    val meta = new ObjectMetadata()
    meta.setContentType("application/json")
    import java.io.ByteArrayInputStream
    val fileContentStream = new ByteArrayInputStream(fileContent.getBytes)
    s3client.putObject(blobJsonsBucket, s"batch-index/${UUID.randomUUID().toString}.json", fileContentStream, meta)
  }

  def batchIndex(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[String]] = prepareBlobs(mediaIds)
    val images = Await.result(blobsFuture, Duration.Inf)
    println(s"prepared json blobs list of size: ${images.size}")

    println("attempting to send bulk insert request to elasticsearch")
    val bulkRes: Future[Response[BulkResponse]] = esClient.execute {
      bulk(
        images.map(img => indexInto(esIndex) source img)
      )
    }

    bulkRes.onComplete {
      case Success(bulkRes) =>
        println(s"bulk insert was successful, items inserted, it took: ${bulkRes.result.took}")
        println("items: ")
        bulkRes.result.items.foreach { item =>
          println(item)
        }
      case Failure(exception) =>
        println(s"bulk insert failed: ${exception.getMessage}")
    }

  }
}


object ImagesIndexerLocalHandler extends App {

  import scala.concurrent.ExecutionContext.Implicits.global

  val mediaIds = List(
    "011db3facffd4ef3d3e07eabbd3c07bb41cbf819",
    "011a95f670b71e4dd223f4b8eda5bfb41235ca7e",
    "066d163d11dfdc8223fb9a15fbf5265f0e47655b",
    "d23c0faaed970d9769e67d7ed4eefbbb35b6fccc",
    "d23c0e19cdc10a7573d4c712313a105863e998c3",
    "non-existent"
  )


  // direct ES insert
  //  ImagesIndexer.batchIndex(mediaIds)

  // s3 store of items
  ImagesIndexer.storeImagesForBatchInsert(mediaIds)

}
