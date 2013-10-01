package lib

import com.amazonaws.services.sns.{AmazonSNS, AmazonSNSClient}
import com.amazonaws.services.sns.model.PublishRequest
import scalaz.syntax.id._

object SNS {

  lazy val client: AmazonSNS =
    new AmazonSNSClient(Config.awsCredentials) <| (_ setEndpoint Config.awsEndpoint)

  def publish(message: String, subject: Option[String]): Unit =
    client.publish(new PublishRequest(Config.topicArn, message, subject.orNull))

}
