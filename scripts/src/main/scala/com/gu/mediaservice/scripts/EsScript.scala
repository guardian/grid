package com.gu.mediaservice.scripts

import org.elasticsearch.action.search.SearchResponse
import org.elasticsearch.search.sort.SortOrder
import org.elasticsearch.index.query.QueryBuilders.matchAllQuery
import org.elasticsearch.common.unit.TimeValue

import com.gu.mediaservice.lib.elasticsearch.{Mappings, ElasticSearchClient}

object MoveIndex extends EsScript {
  def run(esHost: String, extraArgs: List[String]) {

    object EsClient extends ElasticSearchClient {
      val imagesAlias = "imagesAlias"
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

  def run(esHost: String, extraArgs: List[String]) {

    object EsClient extends ElasticSearchClient {
      val imagesAlias = "imagesAlias"
      val port = esPort
      val host = esHost
      val cluster = esCluster

      def reindex {
        val scrollTime = new TimeValue(10 * 60 * 1000) // 10 minutes in milliseconds
        val scrollSize = 500
        val srcIndex = getCurrentAlias.get // TODO: error handling if alias isn't attached

        val srcIndexVersionCheck = """images_(\d+)""".r
        val srcIndexVersion = srcIndex match {
          case srcIndexVersionCheck(version) => version.toInt
          case _ => 1
        }
        val newIndex = s"${imagesIndexPrefix}_${srcIndexVersion+1}"

        createIndex(newIndex)

        val query = client.prepareSearch(srcIndex)
          .setTypes(imageType)
          .setScroll(scrollTime)
          .setQuery(matchAllQuery)
          .setSize(scrollSize)
          .addSort("uploadTime", SortOrder.ASC)

        def reindexScroll(scroll: SearchResponse, done: Long = 0) {
          val total = scroll.getHits.totalHits
          val doing = done + scrollSize

          // roughly accurate as we're using done, which is relative to scrollSize, rather than the actual number of docs in the new index
          val percentage = (done.toFloat / total) * 100

          val hits = scroll.getHits.hits

          if (hits.nonEmpty) {
            // TODO: Abstract out logging
            System.out.println(s"Reindexing $doing of $total ($percentage%)")

            val bulk = client.prepareBulk

            hits.foreach { hit =>
              bulk.add(client.prepareIndex(newIndex, imageType, hit.id)
                .setSource(hit.source))
            }

            bulk.execute.actionGet
            reindexScroll(client.prepareSearchScroll(scroll.getScrollId)
              .setScroll(scrollTime).execute.actionGet, doing)
          }
        }

        Thread.sleep(1000)

        reindexScroll(query.execute.actionGet)

        // TODO: deleteIndex when we are confident
        client.close()
      }
    }
    EsClient.reindex
  }

  def usageError: Nothing = {
    System.err.println("Usage: Reindex <ES_HOST>")
    sys.exit(1)
  }

}

object UpdateMapping extends EsScript {

  def run(esHost: String, extraArgs: List[String]) {
    // TODO: add the ability to update a section of the mapping
    object EsClient extends ElasticSearchClient {
      val imagesAlias = "imagesAlias"
      val port = esPort
      val host = esHost
      val cluster = esCluster

      def updateMappings {
        client.admin.indices
          .preparePutMapping(imagesAlias)
          .setType(imageType)
          .setSource(Mappings.imageMapping)
          .execute.actionGet

        client.close
      }
    }

    EsClient.updateMappings
  }

  def usageError: Nothing = {
    System.err.println("Usage: UpdateMapping <ES_HOST>")
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
