package com.gu.mediaservice.scripts

import org.elasticsearch.search.sort.SortOrder

import org.elasticsearch.index.query.QueryBuilders.matchAllQuery
import org.elasticsearch.common.unit.TimeValue

import com.gu.mediaservice.lib._
import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient}



object Reindex {
  // FIXME: Get from generic config (no can do as Config is coupled to Play)
  // TODO: make generic error handling etc that we share with StackScript

  final val esApp   = "elasticsearch"
  final val esPort = 9300
  final val esCluster = "media-api"
  final val version = "2"
  lazy val credentials = UserCredentials.awsCredentials

  def apply(args: List[String]) {
    // TODO: Use Stage to get host (for some reason this isn't working)
    // TODO: Automatically get and create indices
    val (esHost, srcIndex: String, newIndex: String) = args match {
      case host :: sIndex :: nIndex :: _ => (host, sIndex, nIndex)
      case _ => sys.exit(1) // FIXME: Error handling
    }

    object EsClient extends ElasticSearchClient {
      val port = esPort
      val host = esHost
      val cluster = esCluster

      // Taken from (could do with a little more FP especially around [1]):
      // * http://blog.iterable.com/how-we-sped-up-elasticsearch-queries-by-100x-part-1-reindexing/
      // * https://github.com/guardian/elasticsearch-remap-tool/blob/master/src/main/scala/ElasticSearch.scala
      def reindex(srcIndexPrefix: String, newIndexPrefix: String) = {
        val scrollTime = new TimeValue(600000)
        val scrollSize = 10
        val srcIndex = s"$imagesIndexSuffix$srcIndexPrefix"
        val newIndex = s"$imagesIndexSuffix$newIndexPrefix"

        // We sort the query by old -> new so that we won't loose any records
        // If one is added it would be at the end of the while loop we're running
        val query = client.prepareSearch(srcIndex)
          .setTypes(imageType)
          .setScroll(scrollTime)
          .setQuery(matchAllQuery)
          .setSize(scrollSize)
          .addSort("uploadedBy", SortOrder.ASC)

        var scroll = query.execute.actionGet // Fixme [1]

        // 1. create new index
        // 2. fill new index
        // 3. point alias to new index
        // 4. remove alias from old index
        createIndex(newIndex)

        while(scroll.getHits.hits.length > 0) {
          // Prepare a bulk reindex request
          val bulk = client.prepareBulk
          scroll.getHits.hits.foreach { hit =>
            bulk.add(
              client
                .prepareIndex(newIndex, imageType, hit.id)
                .setSource(hit.source))
          }

          bulk.execute.actionGet

          scroll = client.prepareSearchScroll(scroll.getScrollId)
            .setScroll(scrollTime).execute.actionGet
        }

        createAlias(newIndex)
        deleteAlias(srcIndex)
      }
    }

    EsClient.reindex(srcIndex, newIndex)
  }

}
