import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import com.gu.mediaservice.lib.config.PropertiesConfig

object Config {

  private lazy val properties: Map[String, String] =
    PropertiesConfig.fromFile("/etc/gu/thrall.conf")

  lazy val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

}
