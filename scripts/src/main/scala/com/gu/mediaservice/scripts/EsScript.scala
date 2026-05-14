package com.gu.mediaservice.scripts

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, Mappings}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.handlers.index.GetIndexResponse
import com.sksamuel.elastic4s.requests.searches.SearchResponse
import com.sksamuel.elastic4s.{Indexes, Response}
import play.api.libs.json.Json

import java.io.{File, PrintWriter}
import scala.annotation.tailrec
import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.{Duration, DurationInt, SECONDS}


// TODO: add the ability to update a section of the mapping
object UpdateMapping extends EsScript {

  def run(esUrl: String, extraArgs: List[String]): Unit = {

    object MappingsClient extends EsClient(esUrl) {
      def updateMappings(specifiedIndex: Option[String]): Unit = {
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

  def run(esUrl: String, extraArgs: List[String]): Unit = {

    object MappingsClient extends EsClient(esUrl) {
      def getMappings(specifiedIndex: Option[String]): Unit = {
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

  def run(esUrl: String, extraArgs: List[String]): Unit = {

    object SettingsClient extends EsClient(esUrl) {
      if (!url.contains("localhost")) {
        System.err.println(s"You can only run UpdateSettings on localhost, not '$esUrl'")
        System.exit(1)
      }

      def updateIdxSettings(specifiedIndex: Option[String]): Unit = {

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

  def run(esUrl: String, extraArgs: List[String]): Unit = {

    object SettingsClient extends EsClient(esUrl) {
      def getIdxSettings(specifiedIndex: Option[String]): Unit = {
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
object DownloadAllEsIds extends EsScript {

  def run(esUrl: String, extraArgs: List[String]): Unit = {

    println(s"Getting all ids from $esUrl")

    object Client extends EsClient(esUrl) {

      def writeAllEsIdsToFile(filename: String) = {

        val file = new File(filename)

        val writer = new PrintWriter(file)

        @tailrec
        def processResponseAndStartNext(prevResponse: Response[SearchResponse]): Unit = {
          if(prevResponse.status != 200) {
            writer.close()
            client.close()
            throw new Exception("Failed performing search query")
          }

          println(s"Adding ${prevResponse.result.hits.hits.length} IDs to ${file.getAbsolutePath}")

          prevResponse.result.hits.hits.map(_.id).foreach(writer.println)

          // can't be map/foreach if we want tail recursion (for efficiency)
          prevResponse.result.scrollId match {
            case None => () // done
            case Some(scrollId) =>
              processResponseAndStartNext(
                client.execute(
                  searchScroll(scrollId)
                    .keepAlive(10.seconds)
                ).await
              )
          }
        }

        processResponseAndStartNext(
          client.execute(
            search(currentIndex)
              .size(1000)
              .storedFields("_id") // ensures we only return the id field
              .scroll(1.minute)
          ).await
        )

        writer.close()
      }

    }

    Client.writeAllEsIdsToFile(extraArgs.headOption.getOrElse(throw new Exception("No filename specified")))

  }


  def usageError: Nothing = {
    System.err.println("Usage: GetAllEsIds <ES_URL> <output_file>")
    sys.exit(1)
  }
}

abstract class EsScript {
  // FIXME: Get from config (no can do as Config is coupled to Play)
  final val esImagesAlias = "Images_Current"
  final val esImagesReadAlias = "Images_Current"
  final val esShards = 5
  final val esReplicas = 0

  def log(msg: String) = System.out.println(s"[${getClass.getName}]: $msg")

  def apply(args: List[String]): Unit = {
    // FIXME: Use Stage to get host (for some reason this isn't working)
    val (esUrl, extraArgs) = args match {
      case h :: t => (h, t)
      case _ => usageError
    }

    run(esUrl, extraArgs)
  }

  class EsClient(val url: String) extends ElasticSearchClient {
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

  def run(esUrl: String, args: List[String]): Unit
  def usageError: Nothing
}
