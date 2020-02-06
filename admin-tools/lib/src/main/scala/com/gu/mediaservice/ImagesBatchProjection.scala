package com.gu.mediaservice

import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import play.api.libs.json.Json

import scala.concurrent.{ExecutionContext, Future}

object ImagesBatchProjection {
  def apply(apiKey: String, domainRoot: String): ImagesBatchProjection =
    new ImagesBatchProjection(apiKey, domainRoot)
}

class ImagesBatchProjection(apiKey: String, domainRoot: String) {

  private def createImageProjector = {
    val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
    val cfg = ImageDataMergerConfig(apiKey, services)
    if (!cfg.isValidApiKey()) throw new IllegalArgumentException("provided api_key is invalid")
    new ImageDataMerger(cfg)
  }

  private val ImageProjector = createImageProjector

  def prepareImageItemsBlobs(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    Future.traverse(mediaIds) { id =>
      ImageProjector.getMergedImageData(id)
    }.map(_.flatten.map(i => Json.stringify(Json.toJson(i))))
  }

}

//object ImagesIndexer {
//
//  private val apiKey = "dev-"
//  val domainRoot = "local.dev-gutools.co.uk"
//  private val projectionBaseEndpoint = "https://admin-tools.media.local.dev-gutools.co.uk/images/projection"
//  private val esEndpoint = "http://localhost:9200"
//  private val esIndex = "images/_doc"
//  private val esClient = ElasticClient(ElasticProperties(esEndpoint))
//  private val blobJsonsBucket = "media-service-admin-tools-dev"
//  val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
//
//  private def prepareImageItemsBlobs(mediaIds: List[String])(implicit ec: ExecutionContext) = {
//    val cfg = ImageDataMergerConfig(apiKey, services)
//    if (!cfg.isValidApiKey()) throw new IllegalArgumentException("provided api_key is invalid")
//    val imageDataMerger = new ImageDataMerger(cfg)
//    Future.traverse(mediaIds) { id =>
//      val projectionEndpoint = s"$projectionBaseEndpoint/$id"
//      val reqUrl = new URL(projectionEndpoint)
//      GridClient.makeGetRequestAsync(reqUrl, apiKey)
//      imageDataMerger.getMergedImageData(id)
//    }.map(_.flatten.map(i => Json.stringify(Json.toJson(i))))
//  }
//
//  private def s3client = {
//    lazy val awsCredentials = new AWSCredentialsProviderChain(
//      new ProfileCredentialsProvider("media-service"),
//      InstanceProfileCredentialsProvider.getInstance()
//    )
//    AmazonS3ClientBuilder.standard()
//      .withCredentials(awsCredentials)
//      .withRegion(Region.EU_Ireland.toAWSRegion.getName)
//      .build()
//  }
//
//  def storeImagesForBatchInsertAndNotify(mediaIds: List[String])(implicit ec: ExecutionContext) = {
//    val blobsFuture: Future[List[String]] = prepareImageItemsBlobs(mediaIds)
//    val images: List[String] = Await.result(blobsFuture, Duration.Inf)
//    println(s"prepared json blobs list of size: ${images.size}")
//    println("attempting to store blob to s3")
//    val fileContent = images.mkString("\n")
//    val meta = new ObjectMetadata()
//    meta.setContentType("application/json")
//    import java.io.ByteArrayInputStream
//    val fileContentStream = new ByteArrayInputStream(fileContent.getBytes)
//    s3client.putObject(blobJsonsBucket, s"batch-index/${UUID.randomUUID().toString}.json", fileContentStream, meta)
//  }
//
//  // that can potentially be done in thrall
//  def batchIndex(mediaIds: List[String])(implicit ec: ExecutionContext) = {
//    val blobsFuture: Future[List[String]] = prepareImageItemsBlobs(mediaIds)
//    val images = Await.result(blobsFuture, Duration.Inf)
////    val imagesWithBrokenOnes = images.zipWithIndex.map(el => if (el._2 % 2 == 0) "*******//////////4272" else el._1)
//    println(s"prepared json blobs list of size: ${images.size}")
//
//    println("attempting to send bulk insert request to elasticsearch")
//    val bulkRes: Future[Response[BulkResponse]] = esClient.execute {
//      bulk(
//        images.map(img => indexInto(esIndex) source img)
//      )
//    }
//
//    bulkRes.onComplete {
//      case Success(bulkRes) =>
//        val esError = bulkRes.error
//        val itemErrors = bulkRes.result.items.map(_.error)
//        println(s"esError: $esError")
//        println(s"itemErrors: $itemErrors")
//        println(s"bulk insert was successful, items inserted, it took: ${bulkRes.result.took}")
//        println("items: ")
//        bulkRes.result.items.foreach { item =>
//          println(item)
//        }
//      case Failure(exception) =>
//        println(s"bulk insert failed: ${exception.getMessage}")
//    }
//
//  }
//}
//
//

