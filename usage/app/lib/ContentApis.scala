package lib

import com.gu.contentapi.client.model.{HttpResponse, ItemQuery}
import com.gu.contentapi.client._

import java.net.URI
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}

abstract class UsageContentApiClient(config: UsageConfig)(implicit val executor: ScheduledExecutor)
  extends GuardianContentClient(apiKey = config.capiApiKey) with RetryableContentApiClient
{
  def usageQuery(contentId: String): ItemQuery = {
    ItemQuery(contentId)
      .showFields("firstPublicationDate,isLive,internalComposerCode")
      .showElements("image")
      .showAtoms("media")
  }
}

class LiveContentApi(config: UsageConfig)(implicit val ex: ScheduledExecutor)
  extends UsageContentApiClient(config)
{
  override val targetUrl: String = config.capiLiveUrl
  override val backoffStrategy: BackoffStrategy = BackoffStrategy.doublingStrategy(2.seconds, config.capiMaxRetries)
}

class PreviewContentApi(config: UsageConfig)(implicit val ex: ScheduledExecutor)
  extends UsageContentApiClient(config)
{
  override val targetUrl: String = config.capiPreviewUrl
  override val backoffStrategy: BackoffStrategy = BackoffStrategy.doublingStrategy(2.seconds, config.capiMaxRetries)
  val signer = new IAMSigner(config.awsCredentials, config.awsRegionName)

  override def get(
    url: String,
    headers: Map[String, String]
  )(implicit context: ExecutionContext): Future[HttpResponse] = {

    val uri = new URI(url)
    val encodedQuery = IAMEncoder.encodeParams(uri.getQuery)

    // no mutation of uris, and no easy way to create from a given one
    val encodedUri = new URI(uri.getScheme, uri.getAuthority, uri.getPath, encodedQuery, uri.getFragment)

    val withIamHeaders = signer.addIAMHeaders(headers, encodedUri)

    super.get(url, withIamHeaders)
  }
}
