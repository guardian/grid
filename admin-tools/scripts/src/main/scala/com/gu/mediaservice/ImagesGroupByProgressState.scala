package com.gu.mediaservice

import com.gu.mediaservice.indexing.{IndexInputCreation, ProduceProgress}
import com.typesafe.scalalogging.LazyLogging

import scala.collection.JavaConverters._

object ImagesGroupByProgressState extends App with LazyLogging {

  if (args.isEmpty) throw new IllegalArgumentException("please provide dynamo table name")

  import InputIdsStore._

  private val dynamoTable = args(0)
  private val ddbClient = AwsHelpers.buildDynamoTableClient(dynamoTable)
  private val stateIndex = ddbClient.getIndex(StateField)

  def execute() = {

    def stateNameToCount(progressType: ProduceProgress): (String, Int) = {
      logger.info(s"calculating stateNameToCount for $progressType")
      val queryRes = stateIndex.query(getAllMediaIdsWithinProgressQuery(progressType))
      val result = progressType.name -> queryRes.iterator.asScala.length
      logger.info(s"result=$result")
      result
    }

    def writeResult(content: String) = {
      import java.io.PrintWriter
      new PrintWriter("re_ingestion_stats.txt") {
        write(content);
        close
      }
    }

    import IndexInputCreation._

    logger.info(s"starting to calculate stats at dynamoTable=$dynamoTable")

    val result = Map(
      stateNameToCount(Enqueued),
      stateNameToCount(NotFound),
      stateNameToCount(KnownError),
      stateNameToCount(NotStarted),
      stateNameToCount(InProgress),
    ).mkString("\n")

    logger.info(s"results from dynamoTable=$dynamoTable")
    logger.info(result)

    writeResult(result)
  }

  execute()
}
