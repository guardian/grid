package com.gu.mediaservice

import com.gu.mediaservice.indexing.{IndexInputCreation, ProduceProgress}
import com.typesafe.scalalogging.LazyLogging

object ImagesGroupByProgressState extends App with LazyLogging {

  if (args.isEmpty) throw new IllegalArgumentException("please provide dynamo table name")

  import InputIdsStore._

  private val dynamoTable = args(0)
  private val ddbClient = BatchIndexHandlerAwsFunctions.buildDynamoTableClient(dynamoTable)
  private val stateIndex = ddbClient.getIndex(StateField)

  def execute() = {

    def stateNameToCount(progressType: ProduceProgress) = {
      logger.info(s"calculating stateNameToCount for $progressType")
      val result = stateIndex.query(getAllMediaIdsWithinStateQuery(progressType.stateId))
      val iterator = result.iterator()
      var count: Long = 0
      while (iterator.hasNext) {
        count += 1
        iterator.next()
      }
      val ans = progressType.name -> count
      logger.info(s"result=$ans")
      ans
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
      stateNameToCount(Finished),
      stateNameToCount(NotFound),
      stateNameToCount(KnownError),
      stateNameToCount(NotStarted),
    ).mkString("\n")

    logger.info(s"results from dynamoTable=$dynamoTable")
    logger.info(result)

    writeResult(result)

  }

  execute()
}
