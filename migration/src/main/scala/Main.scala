import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, ElasticSearchConfig}
import org.elasticsearch.action.search.SearchResponse
import org.elasticsearch.common.unit.TimeValue
import org.elasticsearch.index.query.QueryBuilders
import org.elasticsearch.search.SearchHit
import play.api.Logger

import scala.concurrent.duration.{Duration, SECONDS}

object Main extends App {

  val TenSeconds = Duration(10, SECONDS)
  val ScrollSize = 20

  val es1Host = args(0)
  val es1Port = args(1).toInt
  val es1Cluster = args(2)
  val es1Index = args(3)

  val es1Config = ElasticSearchConfig(writeAlias = es1Index, host = es1Host, port = es1Port, cluster = es1Cluster)

  Logger.info("Configuring ES1")
  val es1 = new ElasticSearchClient {
    override def host = es1Config.host
    override def port = es1Config.port
    override def cluster = es1Config.cluster
    override def imagesAlias = es1Config.cluster
    override def clientTransportSniff = false
  }

  println("Waiting for ES1 healthly check")
  es1.waitUntilHealthy()
  println("ES1 connection is healthly")

  println("Counting ES1 images")
  val countES1ImagesQuery = es1.client.prepareSearch(es1Index).setTypes("image").setSize(0)
  private val response: SearchResponse = es1.client.search(countES1ImagesQuery.request()).actionGet()
  println("Found " + response.getHits.totalHits() + " images to migrate")

  // Migrate images by scolling the ES1 index and bulk indexing the docs into the ES6 index
  def migrate(hits: Seq[SearchHit]) = {
    def preview(h: SearchHit) = println(h.id)

    println("Got " + hits.size + " hits")
    hits.foreach(preview)
    // TODO actually migrate
  }

  println("Scrolling through ES1 images")
  def scrollImages() = {
    val ScrollTime = new TimeValue(60000)

    def scroll = {
      es1.client.prepareSearch(es1Index)
        .setScroll(ScrollTime)
        .setQuery(QueryBuilders.matchAllQuery())
        .setSize(ScrollSize).execute().actionGet()
    }

    var scrollResp = scroll
    while (scrollResp.getHits.getHits.length > 0) {
      val hits: Array[SearchHit] = scrollResp.getHits.getHits
      migrate(hits)
      println("Scrolling")
      scrollResp = es1.client.prepareSearchScroll(scrollResp.getScrollId()).setScroll(ScrollTime).execute().actionGet()
    }
  }

  scrollImages()

  println("Done")
}


