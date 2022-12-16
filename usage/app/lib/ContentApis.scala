package lib

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProvider, AWSCredentialsProviderChain, STSAssumeRoleSessionCredentialsProvider}
import com.amazonaws.services.securitytoken.{AWSSecurityTokenService, AWSSecurityTokenServiceClientBuilder}
import com.gu.contentapi.client._
import com.gu.contentapi.client.model.{HttpResponse, ItemQuery}

import java.net.URI
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}

abstract class UsageContentApiClient(config: UsageConfig)(implicit val executor: ScheduledExecutor)
    extends GuardianContentClient(apiKey = config.capiApiKey) {

  def usageQuery(contentId: String): ItemQuery = {
    ItemQuery(contentId)
      .showFields("firstPublicationDate,isLive,internalComposerCode")
      .showElements("image")
      .showAtoms("media")
  }
}

class LiveContentApi(config: UsageConfig)(implicit val ex: ScheduledExecutor)
    extends UsageContentApiClient(config) with RetryableContentApiClient {

  override val targetUrl: String = config.capiLiveUrl
  override val backoffStrategy: BackoffStrategy = BackoffStrategy.doublingStrategy(2.seconds, config.capiMaxRetries)
}

class PreviewContentApi(protected val config: UsageConfig)(implicit val ex: ScheduledExecutor)
  // ensure IAMAuthContentApiClient is the first trait in this list!
    extends UsageContentApiClient(config) with IAMAuthContentApiClient with RetryableContentApiClient {

  override val targetUrl: String = config.capiPreviewUrl
  override val backoffStrategy: BackoffStrategy = BackoffStrategy.doublingStrategy(2.seconds, config.capiMaxRetries)
}

// order of mixing is important. Some client traits (notably RetryableContentApiClient!)
// also override get, adding header(s) (and could potentially edit the uri too) before calling super.get(). Those
// traits must be executed BEFORE this trait, so that the get override in this trait
// receives the headers that will actually be sent over the wire.
// so any class mixing this in should have it first in the list of traits, eg.
//   class MyCapiClient extends GuardianContentApiClient(apiKey)
//     with IAMAuthContentApiClient with RetryableContentApiClient with MyOtherClientTraits
// ie. the super calls will travel "from right to left" along the trait list, and this trait can sign the accumulated headers
trait IAMAuthContentApiClient extends ContentApiClient {
  protected val config: UsageConfig

  lazy val sts: AWSSecurityTokenService = AWSSecurityTokenServiceClientBuilder.standard()
    .withRegion(config.awsRegionName)
    .build()

  lazy val capiCredentials: AWSCredentialsProvider =
    config.capiPreviewRole.map(
      new STSAssumeRoleSessionCredentialsProvider.Builder(_, "capi")
        .withStsClient(sts)
        .build()
    ).getOrElse(new ProfileCredentialsProvider("capi")) // will be used if stream is ever run locally (unusual)

  abstract override def get(
    url: String,
    headers: Map[String, String]
  )(implicit context: ExecutionContext): Future[HttpResponse] = {

    val uri = new URI(url)
    val encodedQuery = IAMEncoder.encodeParams(uri.getQuery)

    // no mutation of uris, and no easy way to create from a given one
    val encodedUri = new URI(uri.getScheme, uri.getAuthority, uri.getPath, encodedQuery, uri.getFragment)

    val signer = new IAMSigner(capiCredentials, config.awsRegionName)

    val withIamHeaders = signer.addIAMHeaders(headers, encodedUri)

    super.get(encodedUri.toString, withIamHeaders)
  }
}
