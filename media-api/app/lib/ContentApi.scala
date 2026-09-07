package lib
import com.gu.contentapi.client._

class ContentApi(config: MediaApiConfig)
  extends GuardianContentClient(apiKey = config.capiApiKey)  {

  override val targetUrl: String = config.capiLiveUrl
}
