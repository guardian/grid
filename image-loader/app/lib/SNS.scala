package lib

import _root_.play.api.Logger
import com.amazonaws.services.sns.{AmazonSNS, AmazonSNSClient}
import com.amazonaws.services.sns.model.PublishRequest
import scalaz.syntax.id._


object SNS {

  val snsEndpoint = "sns.eu-west-1.amazonaws.com"

  lazy val client: AmazonSNS =
    new AmazonSNSClient(Config.awsCredentials) <| (_ setEndpoint snsEndpoint)

  def publish(message: String, subject: Option[String]) {
    val result = client.publish(new PublishRequest(Config.topicArn, message, subject.orNull))
    Logger.info(s"Published message: $result")
  }

}
