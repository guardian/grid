package lib

import com.amazonaws.services.sns.AmazonSNSClient


object SNS {

  lazy val client = new AmazonSNSClient(Config.awsCredentials)

}
