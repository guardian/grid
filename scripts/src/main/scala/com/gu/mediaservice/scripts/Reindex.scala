package com.gu.mediaservice.scripts

import org.elasticsearch.action.search.SearchResponse
import org.elasticsearch.search.sort.SortOrder
import org.elasticsearch.index.query.QueryBuilders.matchAllQuery
import org.elasticsearch.common.unit.TimeValue

import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient


object Reindex {
  // FIXME: Get from config (no can do as Config is coupled to Play)
  final val esApp   = "elasticsearch"
  final val esPort = 9300
  final val esCluster = "media-api"

  def log(msg: String) = System.out.println(s"[Reindexer]: $msg")

  def apply(args: List[String]) {
    // TODO: Use Stage to get host (for some reason this isn't working)
    // TODO: Automatically get and create indices
    val (esHost, from: String, to: String) = args match {
      case h :: f :: t :: _ => (h, f, t)
      case _ => usageError
    }

    object EsClient extends ElasticSearchClient {
      val port = esPort
      val host = esHost
      val cluster = esCluster

      // Taken from:
      // * http://blog.iterable.com/how-we-sped-up-elasticsearch-queries-by-100x-part-1-reindexing/
      // * https://github.com/guardian/elasticsearch-remap-tool/blob/master/src/main/scala/ElasticSearch.scala
      def reindex(srcIndexName: String, newIndexName: String) = {
        val scrollTime = new TimeValue(10 * 60 * 1000) // 10 minutes in milliseconds
        val scrollSize = 500
        val srcIndex = s"$imagesIndexPrefix$srcIndexName"
        val newIndex = s"$imagesIndexPrefix$newIndexName"

        // We sort the query by old -> new so that we won't loose any records
        // If one is added it would be at the end of the while loop we're running
        val query = client.prepareSearch(srcIndex)
          .setTypes(imageType)
          .setScroll(scrollTime)
          .setQuery(matchAllQuery)
          .setSize(scrollSize)
          .addSort("uploadedBy", SortOrder.ASC)

        // 1. create new index
        // 2. fill new index
        // 3. point alias to new index
        // 4. remove alias from old index
        createIndex(newIndex)

        def reindexScroll(scroll: SearchResponse, done: Long = 0) {
          val total = scroll.getHits.totalHits
          val doing = done + scrollSize
          val hits = scroll.getHits.hits

          if (hits.length > 0) {
            // TODO: Abstract out logging
            System.out.println(s"Reindexing $doing / $total")

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

        createAlias(newIndex)
        deleteAlias(srcIndex)

        // TODO: Add a delete index when we are confident
      }
    }

    EsClient.reindex(from, to)
  }

  def usageError: Nothing = {
    System.err.println("Usage: Reindex <ES_HOST> <SRC_INDEX> <NEW_INDEX>")
    sys.exit(1)
  }

}
