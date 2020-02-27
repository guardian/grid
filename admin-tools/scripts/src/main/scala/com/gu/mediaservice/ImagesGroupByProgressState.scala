package com.gu.mediaservice

import com.gu.mediaservice.indexing.{IndexInputCreation, ProduceProgress}
import com.typesafe.scalalogging.LazyLogging

import scala.collection.JavaConverters._


object ImagesGroupByProgressState extends App with LazyLogging {

  if (args.isEmpty) throw new IllegalArgumentException("please provide dynamo table name")

  import InputIdsStore._

  private val dynamoTable = args(0)
  private val ddbClient = BatchIndexHandlerAwsFunctions.buildDynamoTableClient(dynamoTable)
  private val stateIndex = ddbClient.getIndex(StateField)

  def execute() = {

    def stateNameToCount(progressType: ProduceProgress) = {
      val result = stateIndex.scan(getAllMediaIdsWithinState(progressType.stateId))
      result.asScala.foreach { _ =>
        // done to initialize lazy result
      }
      val pages = result.pages().asScala.size
      logger.info(s"calculating stateNameToCount for $progressType")
      logger.info(s"pages=$pages")
      val ans = progressType.name -> result.getAccumulatedItemCount
      logger.info(s"result=$ans")
      ans
    }

    def writeResult(content: String) = {
      import java.io.PrintWriter
      new PrintWriter("stats.txt") {
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
