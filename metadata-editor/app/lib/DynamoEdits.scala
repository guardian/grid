package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.model.Edits
import play.api.libs.json.{Json, JsObject}
import play.api.libs.concurrent.Execution.Implicits._

object DynamoEdits {

  val dynamo = new DynamoDB(Config.awsCredentials, Config.dynamoRegion, Config.editsTable)

  def setArchived(id: String, archived: Boolean) = {
    dynamo.booleanSetOrRemove(id, "archived", archived)
      .map(publish(id))
  }

  def publish(id: String)(metadata: JsObject): Edits = {
    val edits = metadata.as[Edits]
    val message = Json.obj(
      "id" -> id,
      "data" -> Json.toJson(edits)
    )

    Notifications.publish(message, "update-image-user-metadata")

    edits
  }
}

