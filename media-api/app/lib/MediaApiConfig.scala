package lib

import com.amazonaws.services.ec2.{AmazonEC2, AmazonEC2ClientBuilder}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.discovery.EC2._
import org.joda.time.DateTime
import play.api.{Configuration, Mode}

import scala.util.Try

case class StoreConfig(
  storeBucket: String,
  storeKey: String
)

class MediaApiConfig(playAppConfiguration: Configuration, mode: Mode) extends CommonConfig("media-api", playAppConfiguration, mode) {
  lazy val keyStoreBucket: String = string("auth.keystore.bucket")

  lazy val configBucket: String = string("s3.config.bucket")
  lazy val usageMailBucket: String = string("s3.usagemail.bucket")

  lazy val quotaStoreKey: String = string("quota.store.key")
  lazy val quotaStoreConfig: StoreConfig = StoreConfig(configBucket, quotaStoreKey)

  // quota updates can only be turned off in DEV
  lazy val quotaUpdateEnabled: Boolean = if (isDev) boolean("quota.update.enabled") else true

  lazy val recordDownloadAsUsage: Boolean = boolean("image.record.download")

  lazy val imagesAlias: String = stringDefault("es.index.aliases.read", playAppConfiguration.get[String]("es.index.aliases.read"))

  lazy val elasticsearch6Url: String =  string("es6.url")
  lazy val elasticsearch6Cluster: String = string("es6.cluster")
  lazy val elasticsearch6Shards: Int = string("es6.shards").toInt
  lazy val elasticsearch6Replicas: Int = string("es6.replicas").toInt

  lazy val imageBucket: String = string("s3.image.bucket")
  lazy val thumbBucket: String = string("s3.thumb.bucket")

  lazy val cloudFrontPrivateKeyLocation: String = "/etc/gu/ssl/private/cloudfront.pem"

  lazy val cloudFrontDomainImageBucket: Option[String] = stringOpt("cloudfront.domain.imagebucket")
  lazy val cloudFrontDomainThumbBucket: Option[String] = stringOpt("cloudfront.domain.thumbbucket")
  lazy val cloudFrontKeyPairId: Option[String]         = stringOpt("cloudfront.keypair.id")

  // Note: had to make these lazy to avoid init order problems ;_;

  lazy val rootUri: String = services.apiBaseUri
  lazy val kahunaUri: String = services.kahunaBaseUri
  lazy val cropperUri: String = services.cropperBaseUri
  lazy val loaderUri: String = services.loaderBaseUri
  lazy val metadataUri: String = services.metadataBaseUri
  lazy val imgopsUri: String = services.imgopsBaseUri
  lazy val usageUri: String = services.usageBaseUri
  lazy val leasesUri: String = services.leasesBaseUri
  lazy val authUri: String = services.authBaseUri
  lazy val loginUriTemplate: String = services.loginUriTemplate
  lazy val collectionsUri: String = services.collectionsBaseUri
  lazy val adminToolsUri: String = services.adminToolsBaseUri

  lazy val requiredMetadata = List("credit", "description", "usageRights")

  lazy val persistenceIdentifier = stringDefault("persistence.identifier", playAppConfiguration.get[String]("persistence.identifier"))
  lazy val queriableIdentifiers = Seq(persistenceIdentifier)

  lazy val persistedRootCollections: List[String] = stringOpt("persistence.collections") match {
    case Some(collections) => collections.split(',').toList
    case None => List("GNM Archive")
  }

  def convertToInt(s: String): Option[Int] = Try { s.toInt }.toOption

  lazy val syndicationStartDate: Option[DateTime] = Try {
    stringOpt("syndication.start").map(d => DateTime.parse(d).withTimeAtStartOfDay())
  }.toOption.flatten
}
