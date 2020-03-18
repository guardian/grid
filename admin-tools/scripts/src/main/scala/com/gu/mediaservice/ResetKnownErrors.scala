package com.gu.mediaservice

import com.gu.mediaservice.indexing.IndexInputCreation
import com.typesafe.scalalogging.LazyLogging
import play.api.libs.json.{JsObject, Json}

import scala.collection.JavaConverters._

object ResetKnownErrors extends App with LazyLogging {

  if (args.isEmpty) throw new IllegalArgumentException("please provide dynamo table name")

  import IndexInputCreation._
  import InputIdsStore._

  private val dynamoTable = args(0)
  private val ddbClient = AwsHelpers.buildDynamoTableClient(dynamoTable)
  private val stateIndex = ddbClient.getIndex(StateField)

  def execute() = {
    val ignoredAtThisScript = 100
    val InputIdsStore = new InputIdsStore(ddbClient, ignoredAtThisScript)

    val mediaIDsWithKnownErrors = stateIndex.query(getAllMediaIdsWithinProgressQuery(KnownError))
      .asScala.toList.map { it =>
      val json = Json.parse(it.toJSON).as[JsObject]
      (json \ PKField).as[String]
    }

    logger.info(s"got ${mediaIDsWithKnownErrors.size}, mediaIds blacklisted as KnownError")
    InputIdsStore.resetItemsState(mediaIDsWithKnownErrors)
  }

  execute()
}
