import com.gu.mediaservice.lib.elasticsearch.ElasticSearchConfig
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.ElasticApi.{RichFuture, bulk, indexInto, search, searchScroll}
import com.sksamuel.elastic4s.ElasticClient
import com.sksamuel.elastic4s.ElasticDsl.{BulkHandler, SearchHandler, SearchScrollHandler}
import com.sksamuel.elastic4s.requests.bulk.BulkRequest
import com.sksamuel.elastic4s.requests.common.RefreshPolicy
import com.sksamuel.elastic4s.requests.searches.SearchHit

import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.{Duration, SECONDS}
import scala.concurrent.{Await, Future}

object Main extends App with JsonCleaners {

  val OneMinute = Duration(60, SECONDS)

  val es6Host = args(0)
  val es6Port = args(1).toInt
  val es6Cluster = args(2)
  val es6Index = args(3)
  val es6Alias = args(4)

  val es7Host = args(5)
  val es7Port = args(6).toInt
  val es7Cluster = args(7)
  val es7Index = args(8)
  val es7Alias= args(9)

  val es6Config = ElasticSearchConfig(alias = es6Alias, url = s"http://$es6Host:$es6Port", cluster = es6Cluster, shards = 5, replicas = 0)
  val es7Config = ElasticSearchConfig(alias = es7Alias, url = s"http://$es7Host:$es7Port", cluster = es7Cluster, shards = 5, replicas = 0)

  Logger.info("Configuring ES6: " + es6Config)
  val es6 = new com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient {
    override def url = es6Config.url
    override def cluster = es6Config.cluster
    override def imagesAlias = es6Config.alias
    override def shards = es6Config.shards
    override def replicas = es6Config.replicas
  }
  println("Waiting for ES6 health check")
  es6.waitUntilHealthy()
  println("ES6 connection is healthly")

  Logger.info("Configuring ES7: " + es7Config)
  val es7 = new com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient {
    override def url = es7Config.url
    override def cluster = es7Config.cluster
    override def imagesAlias = es7Config.alias
    override def shards = es7Config.shards
    override def replicas = es7Config.replicas
  }

  println("Waiting for ES7 health check")
  es7.waitUntilHealthy()
  println("ES7 connection is healthy")

  println("Ensuring ES7 index exists")
  es7.ensureIndexExists(es7Index)
  es7.ensureAliasAssigned()

  println("Counting ES6 images")
  private val response= es6.countImages().await
  private val totalToMigrate: Long = response.catCount
  println("Found " + totalToMigrate + " images to migrate")

  // Migrate images by scolling the ES6 index and bulk indexing the docs into the ES7 index
  var scrolled = 0
  var successes = 0
  var failures = Seq[String]()
  val startTime = DateTime.now()

  def executeIndexWithErrorHandling(client: ElasticClient, definition: BulkRequest, hits: Seq[SearchHit]): Future[Boolean] = {
    (client execute {
      definition
    }).map { response =>
      if (response.isSuccess) {
        Logger.debug("Index succeeded")
        if (response.result.hasFailures) {
          println("Bulk index had failures:")
          response.result.failures.foreach { f =>
            println("Failure: " + f.id + " / " + f.result + " / " + f.error)
            failures = failures :+ f.id
            val source = hits.find( h => h.id == f.id)
            source.map { h =>
              println(h.sourceAsString)
            }
          }
        }
        scrolled = scrolled + hits.size
        successes = successes + response.result.successes.size
        true
      } else {
        Logger.error("Indexing failed: " + response.error)
        throw new RuntimeException("Indexing failed: " + response.error)
      }
    }
  }

  def migrate(hits: Array[SearchHit]) = {
    println("Map " + hits.size + " hits to Bulk index request")

    val bulkIndexRequest: BulkRequest = bulk {
      hits.par.flatMap { h =>
        val json = Json.parse(h.sourceAsString)
        json.validate[Image] match { // Validate that this JSON actually represents an Image object to avoid runtime errors further down the line
          case _: JsSuccess[Image] => {
            // For documents which pass validation, clean them and migrate the raw document source.
            // We send the raw source rather than the serialized image because Elastic scripts have been writing fields directly into the document source
            // which are not captured in the Image domain object (like suggesters).

            // Fix broken null values deposited in the suggestion field by the Elastic scripts.
            val withCleanedSuggest = json.transform(stripNullsFromSuggestMetadataCredit).asOpt.getOrElse(json)
            val cleaned = withCleanedSuggest.transform(pruneUnusedLeasesCurrentField).asOpt.getOrElse(withCleanedSuggest)

            val toMigrate = Json.stringify(cleaned)
            Some(indexInto(es7Index).id(h.id).source(toMigrate))
          }
          case e: JsError => println("Failure: " + h.id + " JSON errors: " + JsError.toJson(e).toString())
            println(h.sourceAsString)
            failures = failures :+ h.id
            None
        }
      }.toIndexedSeq
    }

    println("Submitting bulk index request")
    Await.result(executeIndexWithErrorHandling(es7.client, bulkIndexRequest, hits), OneMinute)
  }

  def scrollImages() = {
    println("Scrolling through ES6 images")//    val ScrollTime = new TimeValue(120000)
    val scrollKeepAlive = "2m"
    val ScrollResultsPerShard = 2000
    println("Creating scroll with size (times number of shards): " + ScrollResultsPerShard)
    var scroll = es6.client.execute{
      search(es6Index)
        .scroll(scrollKeepAlive)
        .limit(ScrollResultsPerShard)
    }.await.result
    var scrollId = scroll.scrollId.get

    while (scroll.hits.hits.length > 0) {
      println("Scrolling.....")
      scrollId = scroll.scrollId.get
      println(scrollId + " / " + scroll.hits.total)
      println("Migrating.....")
      migrate(scroll.hits.hits)
      val duration = new org.joda.time.Duration(startTime, DateTime.now)
      val rate = (successes + failures.size) / duration.getStandardSeconds
      println(successes + " (" + failures.size + ") / " + scroll.hits.total + " in " + duration.getStandardMinutes + " minutes @ " + rate + " per second")

      scroll = es6.client.execute {
        searchScroll(scrollId).keepAlive(scrollKeepAlive)
      }.await.result
    }
  }

  scrollImages()

  println("Scrolled: " + scrolled)
  println("Successes: " + successes)
  println("Failures: " + failures.size)
  println("Failure ids: " + failures.mkString(", "))
  println("Done")

  es6.client.close()
  es7.client.close()
}
