package com.gu.mediaservice.scripts

import org.elasticsearch.action.search.SearchResponse
import org.elasticsearch.search.sort.SortOrder
import org.elasticsearch.index.query.QueryBuilders.matchAllQuery
import org.elasticsearch.common.unit.TimeValue

import com.gu.mediaservice.lib.elasticsearch.{Mappings, ElasticSearchClient}


object Reindex extends EsScript {

  def run(esHost: String, extraArgs: List[String]) {

    object EsClient extends ElasticSearchClient {
      val port = esPort
      val host = esHost
      val cluster = esCluster

      // Taken from:
      // * http://blog.iterable.com/how-we-sped-up-elasticsearch-queries-by-100x-part-1-reindexing/
      // * https://github.com/guardian/elasticsearch-remap-tool/blob/master/src/main/scala/ElasticSearch.scala
      def reindex {
        val scrollTime = new TimeValue(10 * 60 * 1000) // 10 minutes in milliseconds
        val scrollSize = 500
        val srcIndex = getCurrentAlias.get // TODO: error handling if alias isn't attached

        val srcIndexVersionCheck = """images_(\d+)""".r // FIXME: Find a way to add variables to regex
        val srcIndexVersion = srcIndex match {
          case srcIndexVersionCheck(version) => version.toInt
          case _ => 1
        }
        val newIndex = s"${imagesIndexPrefix}_${srcIndexVersion+1}"

        // 1. create new index
        // 2. point alias to new index
        // 3. remove alias from old index
        // 4. fill new index
        createIndex(newIndex)
        assignAliasTo(newIndex)
        removeAliasFrom(srcIndex)

        // We only run the query once we've swapped the indices so as not to lose
        // any data that is being added. We will have a few seconds of the index filling up
        // TODO: Solve edgecase: Someone is editing a file that is not re-indexed yet
        val query = client.prepareSearch(srcIndex)
          .setTypes(imageType)
          .setScroll(scrollTime)
          .setQuery(matchAllQuery)
          .setSize(scrollSize)
          .addSort("uploadedBy", SortOrder.ASC)

        def reindexScroll(scroll: SearchResponse, done: Long = 0) {
          val total = scroll.getHits.totalHits
          val doing = done + scrollSize
          val hits = scroll.getHits.hits

          if (hits.length > 0) {
            // TODO: Abstract out logging
            System.out.println(s"Reindexing $doing of $total")

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

        reindexScroll(query.execute.actionGet)

        // TODO: deleteIndex when we are confident
        client.close()
      }
    }
    EsClient.reindex
  }

}

object UpdateMapping extends EsScript {

  def run(esHost: String, extraArgs: List[String]) {
    // TODO: add the ability to update a section of the mapping
    object EsClient extends ElasticSearchClient {
      val port = esPort
      val host = esHost
      val cluster = esCluster

      def updateMappings {
        client.admin.indices
          .preparePutMapping(imagesAlias)
          .setType(imageType)
          .setSource(Mappings.imageMapping)
          .execute.actionGet
      }
    }

    EsClient.updateMappings
  }
}


abstract class EsScript {
  // FIXME: Get from config (no can do as Config is coupled to Play)
  final val esApp   = "elasticsearch"
  final val esPort = 9300
  final val esCluster = "media-api"

  def log(msg: String) = System.out.println(s"[Reindexer]: $msg")

  def apply(args: List[String]) {
    // TODO: Use Stage to get host (for some reason this isn't working)
    val (esHost, extraArgs) = args match {
      case h :: t => (h, t)
      case _ => usageError
    }

    run(esHost, extraArgs)
  }

  def run(esHost: String, args: List[String])

  def usageError: Nothing = {
    System.err.println("Usage: Reindex <ES_HOST>")
    sys.exit(1)
  }
}