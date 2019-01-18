import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.lib.elasticsearch6.{ElasticSearch6Config, Mappings}
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.bulk.BulkRequest
import com.sksamuel.elastic4s.http.ElasticClient
import com.sksamuel.elastic4s.http.ElasticDsl._
import org.elasticsearch.action.search.{SearchResponse, SearchType}
import org.elasticsearch.common.unit.TimeValue
import org.elasticsearch.index.query.QueryBuilders
import org.elasticsearch.search.SearchHit
import play.api.Logger
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.{Duration, SECONDS}
import scala.concurrent.{Await, Future}

object Main extends App with JsonCleaners {

  val ThirtySeconds = Duration(30, SECONDS)

  val es1Host = args(0)
  val es1Port = args(1).toInt
  val es1Cluster = args(2)
  val es1Index = args(3)

  val es6Host = args(4)
  val es6Port = args(5).toInt
  val es6Cluster = args(6)
  val es6Index = args(7)

  val es1Config = ElasticSearchConfig(writeAlias = es1Index, host = es1Host, port = es1Port, cluster = es1Cluster)
  val es6Config = ElasticSearch6Config(writeAlias = es6Index, host = es6Host, port = es6Port, cluster = es6Cluster, shards = 5, replicas = 1)

  Logger.info("Configuring ES1: " + es1Config)
  val es1 = new com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient {
    override def host = es1Config.host
    override def port = es1Config.port
    override def cluster = es1Config.cluster
    override def imagesAlias = es1Config.cluster
    override def clientTransportSniff = false
  }

  println("Waiting for ES1 health check")
  es1.waitUntilHealthy()
  println("ES1 connection is healthly")

  Logger.info("Configuring ES6: " + es6Config)
  val es6 = new com.gu.mediaservice.lib.elasticsearch6.ElasticSearchClient {
    override def host = es6Config.host
    override def port = es6Config.port
    override def cluster = es6Config.cluster
    override def imagesAlias = es6Config.writeAlias
    override def shards = es6Config.shards
    override def replicas = es6Config.replicas
  }

  println("Waiting for ES6 health check")
  es6.waitUntilHealthy()
  println("ES6 connection is healthly")

  println("Ensuring ES6 index exists")
  es6.ensureIndexExists(es6Index)

  println("Counting ES1 images")
  val countES1ImagesQuery = es1.client.prepareSearch(es1Index).setTypes("image").setSize(0)
  private val response: SearchResponse = es1.client.search(countES1ImagesQuery.request()).actionGet()
  private val totalToMigrate: Long = response.getHits.totalHits()
  println("Found " + totalToMigrate + " images to migrate")

  // Migrate images by scolling the ES1 index and bulk indexing the docs into the ES6 index
  var scrolled = 0
  var successes = 0
  var failures = Seq[String]()

  def migrate(hits: Seq[SearchHit]) = {
    def preview(h: SearchHit) = println(h.id)

    println("Got " + hits.size + " hits")
    val bulkIndexRequest = bulk {
      hits.flatMap { h =>
        val sourceString = h.getSourceAsString
        val json = Json.parse(sourceString)
        json.validate[Image] match {          // Validate that this JSON actually represents an Image object to avoid runtime errors further down the line
          case s: JsSuccess[Image] => {
            // For documents which pass validation, clean them and migrate the raw document source.
            // We send the raw source rather than the serialized image because Elastic scripts have been writing fields directly into the document source
            // which are not captured in the Image domain object (like suggesters).

            // Fix broken null values deposited in the suggestion field by the Elastic scripts.
            val withCleanedSuggest = json.transform(stripNullsFromSuggestMetadataCredit).asOpt.getOrElse(json)
            val cleaned = withCleanedSuggest.transform(pruneUnusedLeasesCurrentField).asOpt.getOrElse(withCleanedSuggest)

            val toMigrate = Json.stringify(cleaned)
            Some(indexInto(es6Index, Mappings.dummyType).id(h.id).source(toMigrate))
          }
          case e: JsError => println("Failure: " + h.id + " JSON errors: " + JsError.toJson(e).toString())
            println(sourceString)
            failures = failures :+ h.id()
            None
        }
      }
    }

    def executeIndexWithErrorHandling(client: ElasticClient, definition: BulkRequest): Future[Boolean] = {
      (client execute {
        definition
      }).map { r =>
        if (r.isSuccess) {
          Logger.debug("Index succeeded")
          if (r.result.hasFailures) {
            println("Bulk index had failures:")
            r.result.failures.foreach { f =>
              println("Failure: " + f.id + " / " + f.result + " / " + f.error)
              failures = failures :+ f.id
              val source = hits.find( h => h.id == f.id)
              source.map { h =>
                println(h.sourceAsString())
              }
            }
          }
          scrolled = scrolled + hits.size
          successes = successes + r.result.successes.size
          true
        } else {
          Logger.error("Indexing failed: " + r.error)
          throw new RuntimeException("Indexing failed: " + r.error)
        }
      }
    }

    Await.result(executeIndexWithErrorHandling(es6.client, bulkIndexRequest), ThirtySeconds)
  }

  println("Scrolling through ES1 images")
  def scrollImages() = {
    val ScrollTime = new TimeValue(60000)
    val ScrollResultsPerShard = 10

    println("Creating scroll with size (times number of shards): " + ScrollResultsPerShard)
    val scroll = es1.client.prepareSearch(es1Index)
      .setSearchType(SearchType.SCAN)
      .setScroll(ScrollTime)
      .setQuery(QueryBuilders.matchAllQuery())
      .setSize(ScrollResultsPerShard).execute().actionGet()

    var scrollResp = es1.client.prepareSearchScroll(scroll.getScrollId).setScroll(ScrollTime).execute().actionGet()

    while (scrollResp.getHits.getHits.length > 0) {
      println(scrolled + " / " + totalToMigrate)
      val hits: Array[SearchHit] = scrollResp.getHits.getHits
      migrate(hits)
      println("Scrolling")
      scrollResp = es1.client.prepareSearchScroll(scrollResp.getScrollId).setScroll(ScrollTime).execute().actionGet()
      println(scrollResp.getScrollId + " / " + scrollResp.getHits.getTotalHits)
    }
  }

  scrollImages()

  println("Scrolled: " + scrolled)
  println("Successes: " + successes)
  println("Failures: " + failures.size)

  println("Failure ids: " + failures.mkString(", "))
  println("Done")
  es1.client.close()
  es6.client.close()
}


