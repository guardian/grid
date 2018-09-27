package com.gu.thrall.clients

import com.gu.thrall.JsonParsing
import com.gu.thrall.config.{ElasticSearchHit, ElasticSearchHits, ElasticSearchResponse, Image}
import com.typesafe.scalalogging.StrictLogging
import org.apache.http.HttpHost
import org.apache.http.entity.ContentType
import org.apache.http.nio.entity.NStringEntity
import org.elasticsearch.action.search.SearchRequest
import org.elasticsearch.client.{ResponseException, RestClient, RestHighLevelClient}
import org.elasticsearch.index.query.QueryBuilders
import org.elasticsearch.search.builder.SearchSourceBuilder
import org.joda.time.DateTime
import play.api.libs.json.{JsValue, Json}

import scala.collection.JavaConverters._
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.io.Source

class ElasticSearch(host: String, port: Integer, protocol: String, indexName: String) extends StrictLogging {

  private[thrall] val restHighLevelClient = new RestHighLevelClient(RestClient.builder(
    new HttpHost(host, port, protocol)
  ))

//  def storeScript(scriptName: String, scriptBody: String): Future[Either[String, String]] = {
//    Future(
//      restHighLevelClient
//        .getLowLevelClient
//        .performRequest("POST", s"/_scripts/$scriptName", Map[String, String]().asJava,
//        new NStringEntity(scriptBody, ContentType.APPLICATION_JSON)).getStatusLine.getStatusCode match {
//        case 200 => Right("Script stored")
//        case a => Left(s"Script store failed with response $a")
//      }
//    )
//  }
//
//  def invokeScript(scriptName: String, params:(String, String)*): Future[Either[String, String]] = {
//    Future({
//      val response = restHighLevelClient
//        .getLowLevelClient
//        .performRequest("GET", "/_search", Map[String, String]().asJava,
//        new NStringEntity(
//          s"""
//             | {
//             |   "query": {
//             |     "script": {
//             |       "script": {
//             |         "id": "$scriptName",
//             |         "params": {
//             |           "multiplier": 2
//             |         }
//             |       }
//             |     }
//             |   }
//             | }
//         """.stripMargin, ContentType.APPLICATION_JSON))
//      response.getStatusLine.getStatusCode match {
//        case 200 =>
//          val responseBody = Source.fromInputStream(response.getEntity.getContent).mkString
//          Right(responseBody)
//        case a => Left(s"Script invocation failed with response $a")
//      }
//    })
//  }

  private def loadPainless(str: String) = str.stripMargin.split('\n').map(_.trim.filter(_ >= ' ')).mkString // remove ctrl chars and leading, trailing whitespace

  /*
   Insert the provided 'original' if it does not exist
   Update, merging all existing identifier fields into the new document, if it does
   NB this needs to be an upsert_script approach so that the suggestion is added on even on first write.
   */
  def indexImage(id: String, original: String): Future[Either[String, String]] = Future {
    val painlessSource = loadPainless(
      // If there are old identifiers, then merge any new identifiers into old and use the merged results as the new identifiers
      """
        | if (ctx._source.identifiers != null) {
        |   ctx._source.identifiers.putAll(params.update_doc.identifiers);
        |   params.update_doc.identifiers = ctx._source.identifiers
        | }
        | ctx._source = params.update_doc;
        |
        | if (ctx._source.metadata != null && ctx._source.metadata.credit != null) {
        |   ctx._source.suggestMetadataCredit = [ \"input\": [ ctx._source.metadata.credit ] ]
        | }
      """)

    val upsertScript = s"""
           |{
           |  "scripted_upsert": true,
           |  "script": {
           |    "lang": "painless",
           |    "source": "$painlessSource",
           |    "params": {
           |      "update_doc": $original
           |    }
           |  },
           |  "upsert": $original
           |}
           |""".stripMargin
    val method = "POST"
    val address = s"/$indexName/image/$id/_update/"

    executeAndHandle(upsertScript, method, address, s"Updated image index $id")
  }

  def getImageFuture(id: String): Future[Either[String, Image]] = Future { getImage(id) }

  def getImage(id: String): Either[String, Image] = {
    val response = restHighLevelClient.search(
      new SearchRequest(indexName).source(
        new SearchSourceBuilder()
          .query(
            QueryBuilders
              .termQuery("id", id)
          )
      )
    )
    response.getHits.totalHits match {
      case 1 => JsonParsing.elasticSearchResponseDetails(response.toString) match {
        case Right(ElasticSearchResponse(None,Some(ElasticSearchHits(1, Some(List(ElasticSearchHit(a))))), _)) => Right(a)
        case Left(s) => Left(s"Unable to parse: $s")
        case _ => Left(s"Unable to parse: ${response.toString}")
      }
      case _ => Left(s"Failed to find a single image with id $id")
    }
  }

  def updateImageUsages(id: String, usages: JsValue, lastModified: DateTime): Future[Either[String, String]] = updateImageField(id, usages, lastModified, "usages")

  def updateImageExports(id: String, data: JsValue, lastModified: DateTime): Future[Either[String, String]] = updateImageField(id, data, lastModified, "exports")

  def updateImageUserMetadata(id: String, data: JsValue, lastModified: DateTime): Future[Either[String, String]] = updateImageField(id, data, lastModified, "metadata")

  def updateImageSyndicationRights(id: String, data: JsValue): Future[Either[String, String]] = updateImageField(id, data, DateTime.now(), "syndicationRights")

  def updateImageLeases(id: String, data: JsValue, lastModified: DateTime): Future[Either[String, String]] = updateImageField(id, data, DateTime.now(), "leaseByMedia")

  def updateRcsRights(id: String, data: JsValue, lastModified: DateTime): Future[Either[String, String]] = updateImageField(id, data, lastModified, "rights")

  def deleteInferredRights(id: String): Future[Either[String, String]] = deleteField(id, "syndicationRights")

  def setImageCollections(id: String, data: JsValue): Future[Either[String, String]] = updateImageField(id, data, DateTime.now(), "collections")

  def updateImageField(id: String, data: JsValue, lastModified: DateTime, fieldName: String): Future[Either[String, String]] = Future {
    val jsonData = Json.stringify(data)
    val addUsageScript = s"""
               |{
               |  "script": {
               |    "lang": "painless",
               |    "source": "ctx._source.$fieldName = params.$fieldName",
               |    "params": {
               |      "$fieldName": $jsonData
               |    }
               |  }
               |}
               |""".stripMargin
    val method = "POST"
    val address = s"/$indexName/image/$id/_update/"

    executeAndHandle(addUsageScript, method, address, s"Updated image $id, field $fieldName")
  }

  def deleteImage(id: String): Future[Either[String, String]] = Future {
    val query =
      new SearchSourceBuilder()
          .query(
            QueryBuilders.boolQuery()
              .must(QueryBuilders.termQuery("id", id))
              .mustNot(QueryBuilders.existsQuery("exports"))
              .mustNot(QueryBuilders.existsQuery("usages"))
          )

    val responseText = Source.fromInputStream(execute(query.toString, "POST", s"/$indexName/_delete_by_query").getEntity.getContent).getLines().mkString("")

    JsonParsing.elasticSearchResponseDetails(responseText) match {
      case Right(ElasticSearchResponse(Some(1), _, _)) => Right("OK")
      case Right(ElasticSearchResponse(None, _, _))    => Left(s"Unable to delete image, no total found")
      case Right(ElasticSearchResponse(_, _, _))       => Left("Image not deletable")
      case Left(s)                                     => Left(s)
    }
  }

  def deleteImageExports(id: String): Future[Either[String, String]] = deleteField(id, "exports")

  def deleteAllUsages(id: String): Future[Either[String, String]] = deleteField(id, "usages")

  private def deleteField(id: String, fieldName: String): Future[Either[String, String]] = Future {
    val removeUsageScript = s"""
                            |{
                            |  "script": {
                            |    "lang": "painless",
                            |    "source": "ctx._source.remove('$fieldName')"
                            |  }
                            |}""".stripMargin
    val method = "POST"
    val address = s"/$indexName/image/$id/_update/"

    executeAndHandle(removeUsageScript, method, address, s"Deleted image $id, field $fieldName")
  }

  private def executeAndHandle(script: String, method: String, address: String, message: String) = {
    try {
      logger.debug(s"Provided script length is ${script.length} bytes")
      logger.debug(s"Provided address is '$address'")
      logger.debug(s"Provided method is '$method'")
      execute(script, method.trim, address.trim)
      Right(message)
    } catch {
      case e:ResponseException =>
        val headers = e.getResponse.getHeaders map (h => h.toString) mkString "\n"
        Left(s"'${e.getMessage}' with headers\n$headers\nreceived from $method request to $address\n$script")
    }
  }

  private[thrall] def execute(script: String, method: String, address: String) = {
    restHighLevelClient.getLowLevelClient.performRequest(
      method,
      address,
      Map[String, String]().asJava,   // No parameters
      new NStringEntity(script, ContentType.APPLICATION_JSON))
  }

  def getSuggestion(searchTerm: String, searchField: String, searchName: String, fuzzy: Integer = 0, size: Integer = 10): Either[String, ElasticSearchResponse] = {

    val fuzzyClause = if (fuzzy>0)
      s"""
         |,
         |          "fuzzy" : {
         |            "fuzziness" : $fuzzy
         |          }
       """.stripMargin
    else ""

    val searchScript =
      s"""
         |{
         |  "suggest": {
         |    "$searchName" : {
         |      "text" : "$searchTerm",
         |      "completion" : {
         |        "field" : "$searchField",
         |        "skip_duplicates": true,
         |        "size": $size
         |        $fuzzyClause
         |        }
         |      }
         |    }
         |  }
         |}
         """.stripMargin

    val method = "POST"
    val address = s"/$indexName/_search/"

    val result = execute(searchScript, method, address)

    val responseText = Source.fromInputStream(result.getEntity.getContent).getLines().mkString("")

    JsonParsing.elasticSearchResponseDetails(responseText)

  }
}
