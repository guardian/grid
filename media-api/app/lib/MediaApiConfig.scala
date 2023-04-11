package lib

import com.amazonaws.services.cloudfront.util.SignerUtils
import com.gu.mediaservice.lib.config.{CommonConfigWithElastic, GridConfigResources}
import org.joda.time.DateTime

import java.security.PrivateKey
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

  //Lazy allows this to be empty and not break things unless used somewhere
  lazy val imgPublishingBucket = string("publishing.image.bucket")

  val imageBucket: String = string("s3.image.bucket")
  val thumbBucket: String = string("s3.thumb.bucket")

  val cloudFrontDomainThumbBucket: Option[String]   = stringOpt("cloudfront.domain.thumbbucket")
  val cloudFrontPrivateKeyBucket: Option[String]    = stringOpt("cloudfront.private-key.bucket")
  val cloudFrontPrivateKeyBucketKey: Option[String] = stringOpt("cloudfront.private-key.key")
  val cloudFrontKeyPairId: Option[String]           = stringOpt("cloudfront.keypair.id")

 lazy val softDeletedMetadataTable: String = string("dynamo.table.softDelete.metadata")

  val rootUri: String = services.apiBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val cropperUri: String = services.cropperBaseUri
  val loaderUri: String = services.loaderBaseUri
  val projectionUri: String = services.projectionBaseUri
  val metadataUri: String = services.metadataBaseUri
  val imgopsUri: String = services.imgopsBaseUri
  val usageUri: String = services.usageBaseUri
  val leasesUri: String = services.leasesBaseUri
  val authUri: String = services.authBaseUri
  val loginUriTemplate: String = services.loginUriTemplate
  val collectionsUri: String = services.collectionsBaseUri

  val requiredMetadata = List("credit", "description", "usageRights")

  val persistenceIdentifier = string("persistence.identifier")
  val queriableIdentifiers = Seq(persistenceIdentifier)

  def convertToInt(s: String): Option[Int] = Try { s.toInt }.toOption

  val syndicationStartDate: Option[DateTime] = Try {
    stringOpt("syndication.start").map(d => DateTime.parse(d).withTimeAtStartOfDay())
  }.toOption.flatten
  val useRuntimeFieldsToFixSyndicationReviewQueueQuery = boolean("syndication.review.useRuntimeFieldsFix")

  //BBC custom validity description messages
  val customValidityDescription: Map[String, String] =
    configuration.getOptional[Map[String, String]]("warningText.validityDescription").getOrElse(Map.empty)

  val restrictDownload: Boolean = boolean("restrictDownload")

}
