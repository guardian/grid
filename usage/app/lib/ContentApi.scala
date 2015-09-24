package lib

import com.gu.contentapi.client.GuardianContentClient
import dispatch.Http

object ContentApi extends GuardianContentClient(apiKey = Config.properties("capi.apiKey")) {
  override val targetUrl = Config.properties("capi.url")
}
