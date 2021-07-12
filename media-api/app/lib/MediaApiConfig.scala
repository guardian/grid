package lib

import com.gu.mediaservice.lib.config.{CommonConfigWithElastic, GridConfigResources}
import org.joda.time.DateTime

import scala.util.Try

case class StoreConfig(
  storeBucket: String,
  storeKey: String
)

class MediaApiConfig(resources: GridConfigResources) extends CommonConfigWithElastic(resources) {
  val configBucket: String = string("s3.config.bucket")
  val usageMailBucket: String = string("s3.usagemail.bucket")

  val quotaStoreKey: String = string("quota.store.key")
  val quotaStoreConfig: StoreConfig = StoreConfig(configBucket, quotaStoreKey)

  // quota updates can only be turned off in DEV
  val quotaUpdateEnabled: Boolean = if (isDev) boolean("quota.update.enabled") else true

  val recordDownloadAsUsage: Boolean = boolean("image.record.download")

  //Lazy allows this to be empty and not break things unless used somewhere
  lazy val imgPublishingBucket = string("publishing.image.bucket")

  val imageBucket: String = string("s3.image.bucket")
  val thumbBucket: String = string("s3.thumb.bucket")

  val cloudFrontPrivateKeyLocations: Seq[String] = Seq(
    "/etc/grid/ssl/private/cloudfront.pem",
    "/etc/gu/ssl/private/cloudfront.pem" // TODO - remove once migrated away from
  )

  val cloudFrontDomainImageBucket: Option[String] = stringOpt("cloudfront.domain.imagebucket")
  val cloudFrontDomainThumbBucket: Option[String] = stringOpt("cloudfront.domain.thumbbucket")
  val cloudFrontKeyPairId: Option[String]         = stringOpt("cloudfront.keypair.id")

  val rootUri: String = services.apiBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val cropperUri: String = services.cropperBaseUri
  val loaderUri: String = services.loaderBaseUri
  val metadataUri: String = services.metadataBaseUri
  val imgopsUri: String = services.imgopsBaseUri
  val usageUri: String = services.usageBaseUri
  val leasesUri: String = services.leasesBaseUri
  val authUri: String = services.authBaseUri
  val loginUriTemplate: String = services.loginUriTemplate
  val collectionsUri: String = services.collectionsBaseUri
  val adminToolsUri: String = services.adminToolsBaseUri

  val requiredMetadata = List("credit", "description", "usageRights")

  val persistenceIdentifier = string("persistence.identifier")
  val queriableIdentifiers = Seq(persistenceIdentifier)

  val persistedRootCollections: List[String] = stringOpt("persistence.collections") match {
    case Some(collections) => collections.split(',').toList
    case None => List("GNM Archive")
  }

  def convertToInt(s: String): Option[Int] = Try { s.toInt }.toOption

  val syndicationStartDate: Option[DateTime] = Try {
    stringOpt("syndication.start").map(d => DateTime.parse(d).withTimeAtStartOfDay())
  }.toOption.flatten

  val staffPhotographerOrganisation: String = stringOpt("branding.staffPhotographerOrganisation").filterNot(_.isEmpty).getOrElse("GNM")
}
