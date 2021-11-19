package com.gu.mediaservice.scripts

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, Mappings}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.handlers.index.GetIndexResponse
import com.sksamuel.elastic4s.requests.bulk.BulkResponse
import com.sksamuel.elastic4s.requests.indexes.IndexRequest
import com.sksamuel.elastic4s.requests.searches.{SearchHit, SearchResponse}
import com.sksamuel.elastic4s.{Indexes, Response}
import org.joda.time.DateTime
import play.api.libs.json.Json

import java.util.concurrent.TimeUnit
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.{Duration, FiniteDuration, SECONDS}
import scala.concurrent.{Await, Future}


object Reindex extends EsScript {

  def run(esUrl: String, args: List[String]) = {

    object IndexClient extends EsClient(esUrl) {
      val srcIndexVersionCheck = """images_(\d+)""".r
      val srcIndexVersion = currentIndex match {
        case srcIndexVersionCheck(version) => version.toInt
        case _ => 1
      }
      val nextIndex = s"${imagesIndexPrefix}_${srcIndexVersion+1}"
    }

    def raiseError(msg: String) = {
      System.err.println(s"Reindex error on: $esUrl : $msg ")
      System.err.println("Exiting...")
      IndexClient.client.close()
      System.exit(1)
    }

    def validateCurrentState(esClient: ElasticSearchClient, from: Option[DateTime]) = {
      if(from.exists(_.isAfter(DateTime.now())))
        raiseError("DateTime parameter 'from' must be earlier than the current time" )
    }

    def getArg(argKey: String): Option[String] = {
      args.find(_ contains s"${argKey}=")
        .map(_ replaceFirst(s"${argKey}=", ""))
    }

    val scrollTime = new FiniteDuration(5, TimeUnit.MINUTES)
    val scrollSize = 500
    val currentIndex = IndexClient.currentIndex
    val newIndex = getArg("NEW_INDEX") match {
      case Some(arg) => arg
      case None => IndexClient.nextIndex
    }
    val from = getArg("FROM_TIME") match {
      case Some(arg) => Some(DateTime.parse(arg))
      case None => None
    }
    validateCurrentState(IndexClient, from)
    Await.result(reindex(from, IndexClient), Duration.Inf)
    println(s"Pointing $esImagesReadAlias to new index: $newIndex")
    IndexClient.changeAliasTo(newIndex, currentIndex, esImagesReadAlias)
    println(s"Finished reindexing from $currentIndex to $newIndex")
    IndexClient.client.close()

    def reindex(from: Option[DateTime], esClient: ElasticSearchClient) : Future[SearchResponse] = {

      def _scroll(scroll: SearchResponse, done: Long = 0): Future[SearchResponse] = {
        val client = esClient.client
        val currentBatch = done + scrollSize
        System.out.println(scrollPercentage(scroll, currentBatch, done))

        def bulkFromHits(hits: Array[SearchHit]): BulkResponse = {
          val bulkRequests: Array[IndexRequest] = hits.map { hit =>
            indexInto(newIndex)
              .withId(hit.id)
              .source(hit.sourceAsString)
          }

          val bulkResponse = IndexClient.client.execute({
            bulk(bulkRequests)
          }).await

          bulkResponse.status match {
            case 200 => bulkResponse.result
            case _ => {
              IndexClient.client.close()
              throw new Exception("Failed performing bulk index")
            }
          }
        }

        def scrollPercentage(scroll: SearchResponse, currentBatch: Long, done: Long): String = {
          val total = scroll.hits.total.value
          // roughly accurate as we're using done, which is relative to scrollSize, rather than the actual number of docs in the new index
          val percentage = (Math.min(done,total).toFloat / total) * 100
          s"Reindexing ${Math.min(currentBatch,total)} of $total ($percentage%)"
        }

        def performScroll(scrollId: String, scrollTime: FiniteDuration): SearchResponse = {
          val scrollResponse = IndexClient.client.execute({
            searchScroll(scrollId)
              .keepAlive(scrollTime)
          }).await

          scrollResponse.status match {
            case 200 => scrollResponse.result
            case _ => {
              IndexClient.client.close()
              throw new Exception("Failed performing bulk index")
            }
          }
        }

        def analyseBulkResponse(bulkResponse: BulkResponse) = {
          val successes = bulkResponse.items.filter(item => item.status == 201).map(item => item.id)
          val failures = bulkResponse.items.filterNot(item => item.status == 201).map(item => item.id)
          println(s"...added ${successes.length}/${bulkResponse.items.length} items in ${bulkResponse.took} ms (${failures.length} failures)")
          if (failures.nonEmpty) println(s"......failure IDs: $failures")
        }

        val hits = scroll.hits.hits
        if(hits.nonEmpty) {
          val bulkResponse = bulkFromHits(hits)
          analyseBulkResponse(bulkResponse)
          val scrollResponse = performScroll(scroll.scrollId.get, scrollTime)
          _scroll(scrollResponse, currentBatch)
        } else {
          println("No more results found")
          Future.successful[SearchResponse](scroll)
        }
      }

      def query(from: Option[DateTime]) : SearchResponse = {
        val queryType = from.map(time =>
          rangeQuery("lastModified").gte(from.get.getMillis).lte(DateTime.now.getMillis)
        ).getOrElse(
          matchAllQuery()
        )

        val queryResponse = IndexClient.client.execute({
          search(currentIndex)
//            .types(Mappings.dummyType)
            .scroll(scrollTime)
            .size(scrollSize)
            .query(queryType)
        }).await

        queryResponse.status match {
          case 200 => queryResponse.result
          case _ => {
            IndexClient.client.close()
            throw new Exception("Failed performing search query")
          }
        }
      }

      // if no 'from' time parameter is passed, create a new index
      if(from.isEmpty) {
        IndexClient.createImageIndex(newIndex)
      } else {
        println(s"Reindexing documents modified since: ${from.toString}")
      }

      val startTime = DateTime.now()
      println(s"Reindex started at: $startTime")
      println(s"Reindexing from: ${IndexClient.currentIndex} to: $newIndex")
      val scrollResponse = query(from)
      _scroll(scrollResponse) flatMap  { case (response: SearchResponse) =>
        println(s"Pointing ${IndexClient.imagesCurrentAlias} to new index: $newIndex")
        IndexClient.changeAliasTo(newIndex, currentIndex)

        val changedDocuments: Long = query(Option(startTime)).hits.total.value
        println(s"$changedDocuments changed documents since start")

        if(changedDocuments > 0) {
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
    System.err.println("Usage: Reindex error <ES_URL> [NEW_INDEX=<new_index_name>, FROM_TIME=<datetime>]")
    sys.exit(1)
  }
}

// TODO: add the ability to update a section of the mapping
object UpdateMapping extends EsScript {

  def run(esUrl: String, extraArgs: List[String]) {

    object MappingsClient extends EsClient(esUrl) {
      def updateMappings(specifiedIndex: Option[String]) {
        val index = specifiedIndex.getOrElse(imagesCurrentAlias)
        println(s"Updating mapping on index: $index")

        val result = client.execute {
          putMapping(Indexes(index)) as {
            Mappings.imageMapping.properties
          }
        }.await

        result.status match {
          case 200 => println(Json.prettyPrint(Json.parse(result.body.get)))
          case _ => println(s"Failed updating mapping: ${result.error}")
        }

        client.close
      }

    }

    MappingsClient.updateMappings(extraArgs.headOption)
  }

  def usageError: Nothing = {
    System.err.println("Usage: UpdateMapping <ES_URL>")
    sys.exit(1)
  }
}

object GetMapping extends EsScript {

  def run(esUrl: String, extraArgs: List[String]) {

    object MappingsClient extends EsClient(esUrl) {
      def getMappings(specifiedIndex: Option[String]) {
        val index = specifiedIndex.getOrElse(imagesCurrentAlias)
        println(s"Getting mapping on index: $index")

        val result = Await.result(client.execute(
          getMapping(index)
        ), Duration(30, SECONDS))

        result.status match {
          case 200 => println(Json.prettyPrint(Json.parse(result.body.get)))
          case _ => println(s"Failed getting mapping: ${result.error}")
        }


        client.close()
      }
    }

    MappingsClient.getMappings(extraArgs.headOption)
  }

  def usageError: Nothing = {
    System.err.println("Usage: GetMapping <ES_URL>")
    sys.exit(1)
  }
}

object UpdateSettings extends EsScript {

  def run(esUrl: String, extraArgs: List[String]) {

    object SettingsClient extends EsClient(esUrl) {
      if (!url.contains("localhost")) {
        System.err.println(s"You can only run UpdateSettings on localhost, not '$esUrl'")
        System.exit(1)
      }

      def updateIdxSettings(specifiedIndex: Option[String]) {

        val index = specifiedIndex.getOrElse(imagesCurrentAlias)
        println(s"Getting mapping on index: $index")

        val settingsToAdd: Map[String, String] = Map("max_result_window" -> "25000")

       val resultFut = for {
          _ <- client.execute(closeIndex(index))
          result <- {
            client.execute(
              updateSettings(index)
                .add(settingsToAdd)
            )
          }
          _ <- client.execute(openIndex(index))
        } yield result

        val result = Await.result(resultFut, Duration(30, SECONDS))

        result.status match {
          case 200 => println(Json.prettyPrint(Json.parse(result.body.get)))
          case _ => println(s"Failed updating index settings: ${result.error}")
        }

        client.close
      }
    }

    SettingsClient.updateIdxSettings(extraArgs.headOption)
  }

  def usageError: Nothing = {
    System.err.println("Usage: UpdateSettings <ES_URL>")
    sys.exit(1)
  }
}

object GetSettings extends EsScript {

  def run(esUrl: String, extraArgs: List[String]) {

    object SettingsClient extends EsClient(esUrl) {
      def getIdxSettings(specifiedIndex: Option[String]) {
        val index = specifiedIndex.getOrElse(imagesCurrentAlias)
        println(s"Getting settings on index: $index")

        val result = Await.result(client.execute(
          getSettings(index)
        ), Duration(30, SECONDS))

        result.status match {
          case 200 => println(Json.prettyPrint(Json.parse(result.body.get)))
          case _ => println(s"Failed getting settings: ${result.error}")
        }


        client.close()
      }
    }

    SettingsClient.getIdxSettings(extraArgs.headOption)
  }

  def usageError: Nothing = {
    System.err.println("Usage: GetMapping <ES_URL>")
    sys.exit(1)
  }
}

abstract class EsScript {
  // FIXME: Get from config (no can do as Config is coupled to Play)
  final val esCluster = "media-service"
  final val esImagesAlias = "Images_Current"
  final val esImagesReadAlias = "Images_Current"
  final val esShards = 5
  final val esReplicas = 0

  def log(msg: String) = System.out.println(s"[${getClass.getName}]: $msg")

  def apply(args: List[String]) {
    // FIXME: Use Stage to get host (for some reason this isn't working)
    val (esUrl, extraArgs) = args match {
      case h :: t => (h, t)
      case _ => usageError
    }

    run(esUrl, extraArgs)
  }

  class EsClient(val url: String) extends ElasticSearchClient {
    override def cluster = esCluster
    override def imagesCurrentAlias = esImagesAlias
    override def shards = esShards
    override def replicas = esReplicas

    @deprecated(message = "Should not be used in scripts", since = "2021-Jul-07")
    lazy val imagesMigrationAlias: String = "Images_Migration"

    lazy val indexResult: Response[Map[String, GetIndexResponse]] = client.execute {
      getIndex(imagesCurrentAlias)
    }.await

    lazy val currentIndex: String = indexResult.status match {
      case 200 => {
        indexResult.result.keySet.toList match {
          case head::Nil => head
          case _ => throw new Exception(s"There should only be one index associated with alias before reindexing, " +
            s"however there was: ${indexResult.result.keys}")
        }
      }
      case _ => throw new Exception(s"Failed updating mapping: ${indexResult.error}")
    }

  }

  def run(esUrl: String, args: List[String])
  def usageError: Nothing
}
