package lib

import com.gu.contentapi.client.model.ItemQuery
import com.gu.contentapi.client.{BackoffStrategy, GuardianContentClient, RetryableContentApiClient, ScheduledExecutor}

import scala.concurrent.duration.DurationInt

class LiveContentApi(config: UsageConfig)(implicit val executor: ScheduledExecutor)
  extends GuardianContentClient(apiKey = config.capiApiKey) with RetryableContentApiClient
{
  override val targetUrl: String = config.capiLiveUrl
  override val backoffStrategy: BackoffStrategy = BackoffStrategy.doublingStrategy(2.seconds, 4)

  def usageQuery(contentId: String): ItemQuery = {
    ItemQuery(contentId)
      .showFields("firstPublicationDate,isLive,internalComposerCode")
      .showElements("image")
      .showAtoms("media")
  }
}
