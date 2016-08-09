package lib

import com.gu.contentapi.client.GuardianContentClient
import com.gu.contentapi.client.model.v1.Content
import com.gu.contentapi.buildinfo.CapiBuildInfo

import scala.concurrent.{ExecutionContext, Future}

import com.ning.http.client.Realm.{RealmBuilder, AuthScheme}
import com.ning.http.client.{AsyncHttpClientConfig, AsyncHttpClient}
import com.ning.http.client.AsyncHttpClientConfig.Builder

import org.joda.time.{DateTime, DateTimeZone}

import dispatch.Http

trait ContentHelpers {
  def getContentFirstPublished(content: Content) = for {
    fields <- content.fields
    firstPublicationDate <- fields.firstPublicationDate
    date = new DateTime(firstPublicationDate.iso8601, DateTimeZone.UTC)
  } yield date

}

object PreviewContentApi extends ContentApiRequestBuilder {
  override val targetUrl = Config.capiPreviewUrl

  val realm = new RealmBuilder()
    .setPrincipal(Config.capiPreviewUser)
    .setPassword(Config.capiPreviewPassword)
    .setUsePreemptiveAuth(true)
    .setScheme(AuthScheme.BASIC)
    .build()

  val previewBuilder = builder.setRealm(realm)

  override val client = new AsyncHttpClient(previewBuilder.build)
}

object LiveContentApi extends ContentApiRequestBuilder {
  override val targetUrl = Config.capiLiveUrl
}

class ContentApiRequestBuilder extends GuardianContentClient(apiKey = Config.capiApiKey) with ContentHelpers {
  override val userAgent = "content-api-scala-client/"+CapiBuildInfo.version

  val builder = new Builder()
    .setAllowPoolingConnections(true)
    .setMaxConnectionsPerHost(10)
    .setMaxConnections(10)
    .setConnectTimeout(1000)
    .setRequestTimeout(8000)
    .setCompressionEnforced(true)
    .setFollowRedirect(true)
    .setUserAgent(userAgent)
    .setConnectionTTL(60000)

  val client = new AsyncHttpClient(builder.build)

  override lazy val http = Http(client)
}

