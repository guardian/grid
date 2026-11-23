package com.gu.mediaservice.lib.aws

import play.api.libs.json.Json
import software.amazon.awssdk.imds.Ec2MetadataClient

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.time.Duration
import scala.util.{Try, Using}

object EC2MetadataUtils {

  /** A unique id for the host/task we are running on: the ECS task id when running in ECS, otherwise the EC2 instance id */
  def getInstanceId: Option[String] =
    sys.env.get("ECS_CONTAINER_METADATA_URI_V4").flatMap(getEcsTaskId).orElse(getEc2InstanceId)

  private def getEc2InstanceId: Option[String] = Using(Ec2MetadataClient.create()) { client =>
    client.get("/latest/meta-data/instance-id").asString()
  }.toOption

  // See https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-metadata-endpoint-v4-fargate.html
  private def getEcsTaskId(metadataUri: String): Option[String] = Try {
    val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
    val request = HttpRequest.newBuilder(URI.create(s"$metadataUri/task")).timeout(Duration.ofSeconds(2)).GET().build()
    val body = client.send(request, HttpResponse.BodyHandlers.ofString()).body()
    (Json.parse(body) \ "TaskARN").as[String].split('/').last
  }.toOption

}
