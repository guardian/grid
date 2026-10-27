package lib

import com.gu.mediaservice.lib.config.{CommonConfigWithElastic, GridConfigResources}
import com.gu.mediaservice.lib.elasticsearch.filters
import com.gu.mediaservice.lib.imgproxy.{ImgProxySigning, ImgProxyUrlBuilder}
import com.sksamuel.elastic4s.ElasticApi.{matchPhraseQuery, should}
import com.sksamuel.elastic4s.ElasticDsl.matchQuery
import com.sksamuel.elastic4s.requests.searches.queries.Query
import com.sksamuel.elastic4s.requests.searches.queries.matches.MatchQuery
import org.joda.time.DateTime
import scalaz.NonEmptyList

import scala.collection.immutable
import scala.concurrent.duration.FiniteDuration
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
  val awsRegionName = string("aws.region")

  val imageBucket: String = string("s3.image.bucket")
  val thumbBucket: String = string("s3.thumb.bucket")

  val cloudFrontDomainThumbBucket: Option[String]   = stringOpt("cloudfront.domain.thumbbucket")
  val cloudFrontPrivateKeyBucket: Option[String]    = stringOpt("cloudfront.private-key.bucket")
  val cloudFrontPrivateKeyBucketKey: Option[String] = stringOpt("cloudfront.private-key.key")
  val cloudFrontKeyPairId: Option[String]           = stringOpt("cloudfront.keypair.id")

  val fuzzySearchEnabled: Boolean = boolean("search.fuzziness.enabled")
  val fuzzySearchPrefixLength: Int = intOpt("search.fuzziness.prefixLength").getOrElse(1)
  val fuzzySearchEditDistance: String = stringOpt("search.fuzziness.editDistance") match {
    case Some(editDistance) if editDistance.toIntOption.isDefined => editDistance
    case Some(editDistance) if editDistance.contains("AUTO:") => editDistance  //<- for non-default AUTO word boundaries
    case _ => "AUTO"
  }
  val fuzzyMaxExpansions: Int = intOpt("search.fuzziness.maxExpansions").getOrElse(50)

  val rootUri: String = services.apiBaseUri
  val kahunaUri: String = services.kahunaBaseUri
  val cropperUri: String = services.cropperBaseUri
  val loaderUri: String = services.loaderBaseUri
  val metadataUri: String = services.metadataBaseUri
  val imgopsUri: String = services.imgopsBaseUri
  val imgproxyUri: String = services.imgproxyBaseUri
  val useImgProxy: Boolean = boolean("images.imgproxy.enabled")
  val imgproxySigning: Option[ImgProxySigning] = for {
    key <- stringOpt("images.imgproxy.key")
    salt <- stringOpt("images.imgproxy.salt")
  } yield ImgProxySigning(key, salt)
  // Pass imgproxy a stable s3://bucket/key source (fetched with imgproxy's own IAM role) instead of a
  // pre-signed S3 URL, so imgproxy URLs are cacheable and don't leak credentials. Always pair this with
  // signing (images.imgproxy.key/salt) - unsigned, anyone could read any object in the bucket via imgproxy.
  val imgproxyUseS3Source: Boolean = boolean("images.imgproxy.s3Source.enabled")
  // Signed URLs can't be templated client-side, so we sign a URL per "WIDTHxHEIGHT" bounding box and clients
  // pick the smallest that covers what they need. Defaults are 800px low-res plus common (landscape) screens.
  val imgproxySignedSizes: Seq[(Int, Int)] = {
    val configured = configuration.getOptional[Seq[String]]("images.imgproxy.signedSizes")
      .getOrElse(Seq("800x800", "1280x800", "1920x1080", "2560x1440", "3840x2160"))
    configured.map(size => ImgProxyUrlBuilder.parseSize(size).getOrElse(
      sys.error(s"Invalid images.imgproxy.signedSizes entry '$size', expected WIDTHxHEIGHT")
    ))
  }
  // Unset by default, leaving imgproxy to use its per-format default quality
  val imgproxySignedQuality: Option[Int] = intOpt("images.imgproxy.signedQuality")
  val imgproxySignedUrlTtlSeconds: Option[Long] =
    configuration.getOptional[FiniteDuration]("images.imgproxy.signedUrlTtl").map(_.toSeconds).filter(_ > 0)
  val usageUri: String = services.usageBaseUri
  val leasesUri: String = services.leasesBaseUri
  val authUri: String = services.authBaseUri
  val collectionsUri: String = services.collectionsBaseUri

  val requiredMetadata = NonEmptyList("credit", "description", "usageRights")
  val capiPreviewUrl = string("capi.preview.url")
  val capiPreviewRole = stringOpt("capi.preview.role")
  val defaultMaxRetries = 4
  val capiMaxRetries: Int = intDefault("capi.maxRetries", defaultMaxRetries)
  val capiApiKey = string("capi.apiKey")
  val composerDomain = string("composer.domain")
  val syndicationStartDate: Option[DateTime] = Try {
    stringOpt("syndication.start").map(d => DateTime.parse(d).withTimeAtStartOfDay())
  }.toOption.flatten
  val useRuntimeFieldsToFixSyndicationReviewQueueQuery = boolean("syndication.review.useRuntimeFieldsFix")

  //BBC custom validity description messages
  val customValidityDescription: Map[String, String] =
    configuration.getOptional[Map[String, String]]("warningText.validityDescription").getOrElse(Map.empty)

  val customSpecialInstructions: Map[String, String] =
    configuration.getOptional[Map[String, String]]("usageInstructions").getOrElse(Map.empty)

  val customUsageRestrictions: Map[String, String] =
    configuration.getOptional[Map[String, String]]("usageRestrictions").getOrElse(Map.empty)

  val restrictDownload: Boolean = boolean("restrictDownload")
  // When true, embedded metadata (EXIF/IPTC/XMP) is stripped from downloaded original images via ExifTool,
  // keeping only the copyright/credit fields. When false (the default), images are streamed unmodified.
  val stripDownloadMetadata: Boolean = boolean("images.downloads.stripMetadata.enabled")
  val takedownEnabled: Boolean = booleanOpt("image.takedown.enabled").getOrElse(false)

  val queueUrl: String = stringOpt("sqs.embedder.queue.url").getOrElse("")

  val aiSearchResultLimit: Int = intOpt("ai.search.resultLimit").getOrElse(200)
  val aiSearchEmbeddingCacheMaxSize: Int = intOpt("ai.search.embeddingCache.maxSize").getOrElse(500)

  val maybeAgencyPickQuery: Option[Query] = agencyPicksIngredients.map { ingredients =>
    filters.or(
      ingredients.flatMap {
        case (field, values) => values.map(matchPhraseQuery(field, _))
      }.toList: _*
    )
  }
}
