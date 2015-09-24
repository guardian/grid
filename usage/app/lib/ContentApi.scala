package lib

import com.gu.contentapi.client.GuardianContentClient
import dispatch.Http

object LiveContentApi extends GuardianContentClient(apiKey = Config.properties("capi.apiKey")) {
  override val targetUrl = Config.properties("capi.live.url")
}

object PreviewContentApi extends GuardianContentClient(apiKey = Config.properties("capi.apiKey")) {
  override val targetUrl = Config.properties("capi.preview.url")
}
