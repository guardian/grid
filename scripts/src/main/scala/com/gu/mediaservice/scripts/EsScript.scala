package com.gu.mediaservice.scripts

import org.elasticsearch.action.admin.indices.close.CloseIndexRequest
import org.elasticsearch.action.admin.indices.open.OpenIndexRequest
import org.elasticsearch.action.bulk.BulkRequestBuilder
import org.elasticsearch.action.index.IndexRequestBuilder
import org.elasticsearch.action.search.{SearchRequestBuilder, SearchResponse}
import org.elasticsearch.search.SearchHit
import org.elasticsearch.index.query.QueryBuilders.{ matchAllQuery, rangeQuery}
import org.elasticsearch.common.unit.TimeValue


import com.gu.mediaservice.lib.elasticsearch.{IndexSettings, Mappings, ElasticSearchClient}
import org.joda.time.DateTime
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}
import ExecutionContext.Implicits.global

object MoveIndex extends EsScript {
  def run(esHost: String, extraArgs: List[String]) {

    object EsClient extends ElasticSearchClient {
      val imagesAlias = "readAlias"
      val port = esPort
      val host = esHost
      val cluster = esCluster

      def move {
        val srcIndex = getCurrentAlias.get // TODO: error handling if alias isn't attached
        val srcIndexVersionCheck = """images_(\d+)""".r
        val srcIndexVersion = srcIndex match {
          case srcIndexVersionCheck(version) => version.toInt
          case _ => 1
        }
        val newIndex = s"${imagesIndexPrefix}_${srcIndexVersion+1}"

        assignAliasTo(newIndex)
        removeAliasFrom(srcIndex)
      }
    }

    EsClient.move
  }
  def usageError: Nothing = {
    System.err.println("Usage: MoveIndex <ES_HOST>")
    sys.exit(1)
  }
}

object Reindex extends EsScript {

  def run(esHost: String, args: List[String]) = {
    object EsClient extends ElasticSearchClient {
      val imagesAlias = "writeAlias"
      val port = esPort
      val host = esHost
      val cluster = esCluster
      val initTime = DateTime.now()
      val currentIndex = getCurrentIndices.reverse.head
      val nextIndex = nextIndexName(currentIndex)

      def nextIndexName(currentIndex: String) = {
        val srcIndexVersionCheck = """images_(\d+)""".r
        val srcIndexVersion = currentIndex match {
          case srcIndexVersionCheck(version) => version.toInt
          case _ => 1
        }
        s"${imagesIndexPrefix}_${srcIndexVersion + 1}"
      }
    }

    def raise(msg: String) = {
      System.err.println(s"Reindex error on: $esHost : $msg ")
      System.err.println("Exiting...")
      EsClient.client.close()
      System.exit(1)
    }

    def validateCurrentState(esClient: ElasticSearchClient, from: Option[DateTime]) = {
      if(esClient.getCurrentIndices.isEmpty) raise("no index with the 'write' alias exists")
      if((esClient.getCurrentIndices.length == 2) && from.isEmpty)
        raise("there are two indices with 'write' alias, check your properties file or use http://localhost:9200/_plugin/head/ ")
      if(from.exists(_.isAfter(DateTime.now())))
        raise("DateTime parameter 'from' must be earlier than the current time" )
    }

    val imageType = "image"
    val scrollTime = new TimeValue(5 * 60 * 1000) // 5 minutes in milliseconds
    val scrollSize = 500
    val currentIndex = EsClient.currentIndex
    val newIndex = EsClient.nextIndex

    val from = if(args.isEmpty) None else Some(DateTime.parse(args.head))
    validateCurrentState(EsClient, from)
    Await.result(reindex(from, EsClient), Duration.Inf)

    def reindex(from: Option[DateTime], esClient: ElasticSearchClient) : Future[SearchResponse] = {
      def _scroll(scroll: SearchResponse, done: Long = 0): Future[SearchResponse] = {
        val client = esClient.client
        val currentBatch = done + scrollSize
        System.out.println(scrollPercentage(scroll, currentBatch, done))

        def bulkFromHits(hits: Array[SearchHit]): BulkRequestBuilder = {
          val bulkRequests : Array[IndexRequestBuilder] = hits.map { hit =>
            client.prepareIndex(newIndex, imageType, hit.id).setSource(hit.source) }

          val bulk = client.prepareBulk
          bulkRequests map { bulk.add }
          bulk
        }
        def scrollPercentage(scroll: SearchResponse, currentBatch: Long, done: Long): String = {
          val total = scroll.getHits.totalHits
          // roughly accurate as we're using done, which is relative to scrollSize, rather than the actual number of docs in the new index
          val percentage = (done.toFloat / total) * 100
          s"Reindexing $currentBatch of $total ($percentage%)"
        }


        val hits = scroll.getHits.hits
        if(hits.nonEmpty) {
          bulkFromHits(hits).execute.actionGet
          val scrollResponse = client.prepareSearchScroll(scroll.getScrollId).setScroll(scrollTime).execute.actionGet
          _scroll(scrollResponse, currentBatch)
        } else {
          println("No more results found")
          Future.successful[SearchResponse](scroll)
        }
      }

      def query(from: Option[DateTime]) : SearchRequestBuilder = {
        val queryType = from.map(time =>
          rangeQuery("lastModified").from(from.get).to(DateTime.now)
        ).getOrElse(
          matchAllQuery()
        )

        EsClient.client.prepareSearch(currentIndex)
          .setTypes(imageType)
          .setScroll(scrollTime)
          .setSize(scrollSize)
          .setQuery(queryType)
      }

      // if no 'from' time parameter is passed, create a new index
      if(from.isEmpty) {
        EsClient.createIndex(newIndex)
      } else {
        println(s"Reindexing documents modified since: ${from.toString}")
      }

      val startTime = DateTime.now()
      println(s"Reindex started at: $startTime")
      println(s"Reindexing from: ${EsClient.currentIndex} to: $newIndex")
      val scrollResponse = query(from).execute.actionGet
      _scroll(scrollResponse) flatMap  { case (response: SearchResponse) =>
        val changedDocuments: Long = query(Option(startTime)).execute.actionGet.getHits.getTotalHits
        println(s"$changedDocuments")
        if(changedDocuments > 0) {
          println(s"Adding ${EsClient.imagesAlias} to $newIndex")
          EsClient.assignAliasTo(newIndex)

          println(s"Reindexing changes since start time: $startTime")
          val recurseResponse = reindex(Option(startTime), esClient)
          recurseResponse
        } else {
          Future.successful(response)
        }
      }
    }
  }

  def usageError: Nothing = {
    System.err.println("Usage: Reindex error <ES_HOST>")
    sys.exit(1)
  }
}



object UpdateMapping extends EsScript {

  def run(esHost: String, extraArgs: List[String]) {
    // TODO: add the ability to update a section of the mapping
    object EsClient extends ElasticSearchClient {
      val imagesAlias = "writeAlias"
      val port = esPort
      val host = esHost
      val cluster = esCluster

      def updateMappings(specifiedIndex: Option[String]) {
        val index = getCurrentAlias.getOrElse(imagesAlias)
        println(s"updating mapping on index: $index")
        client.admin.indices
          .preparePutMapping(index)
          .setType(imageType)
          .setSource(Mappings.imageMapping)
          .execute.actionGet


        client.close
      }
    }


    EsClient.updateMappings(extraArgs.headOption)
  }

  def usageError: Nothing = {
    System.err.println("Usage: UpdateMapping <ES_HOST>")
    sys.exit(1)
  }
}

object UpdateSettings extends EsScript {

  def run(esHost: String, extraArgs: List[String]) {
    // TODO: add the ability to update a section of the mapping
    object EsClient extends ElasticSearchClient {
      val imagesAlias = "writeAlias"
      val port = esPort
      val host = esHost
      val cluster = esCluster

      if (esHost != "localhost") {
        System.err.println(s"You can only run UpdateSettings on localhost, not '$esHost'")
        System.exit(1)
      }

      def updateSettings {
        val alias = getCurrentAlias.getOrElse(imagesAlias)
        val indices = client.admin.indices
        indices.close(new CloseIndexRequest(alias))

        indices
          .prepareUpdateSettings(alias)
          .setSettings(IndexSettings.imageSettings)
          .execute.actionGet

        indices.open(new OpenIndexRequest(alias))
        client.close
      }
    }

    EsClient.updateSettings
  }

  def usageError: Nothing = {
    System.err.println("Usage: UpdateSettings <ES_HOST>")
    sys.exit(1)
  }
}

abstract class EsScript {
  // FIXME: Get from config (no can do as Config is coupled to Play)
  final val esApp   = "elasticsearch"
  final val esPort = 9300
  final val esCluster = "media-service"

  def log(msg: String) = System.out.println(s"[Reindexer]: $msg")

  def apply(args: List[String]) {
    // FIXME: Use Stage to get host (for some reason this isn't working)
    val (esHost, extraArgs) = args match {
      case h :: t => (h, t)
      case _ => usageError
    }

    run(esHost, extraArgs)
  }

  def run(esHost: String, args: List[String])
  def usageError: Nothing
}
