package controllers

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.Permissions.DeleteImage
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.config.ServiceHosts
import com.gu.mediaservice.lib.logging.LogMarker
import lib.{ImageResponse, MediaApiConfig}
import lib.elasticsearch.{ElasticSearch, SearchAfterParams, SearchAfterRawResults}
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{verifyNoInteractions, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.libs.json.Json
import play.api.mvc.RequestHeader
import play.api.test.{FakeRequest, Helpers}

import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.concurrent.ExecutionContext.Implicits.global

trait MediaApiTestSupport extends MockitoSugar {
  protected def mediaApiFor(principal: Principal, search: ElasticSearch, imageResponse: ImageResponse, privileged: Boolean = false): MediaApi = {
    val config = mock[MediaApiConfig]
    when(config.domainRoot).thenReturn("example.test")
    when(config.serviceHosts).thenReturn(ServiceHosts.guardianPrefixes)
    when(config.rootUri).thenReturn("https://media.example.test")
    when(config.aiSearchEmbeddingCacheMaxSize).thenReturn(10)

    val components = Helpers.stubControllerComponents()
    val userProvider = mock[UserAuthenticationProvider]
    when(userProvider.loginLink).thenReturn(DisableLoginLink)
    val innerProvider = mock[InnerServiceAuthenticationProvider]
    when(innerProvider.authenticateRequest(any[RequestHeader])).thenAnswer { invocation =>
      val request = invocation.getArgument[RequestHeader](0)
      if (ApiAccessor.hasAccess(principal.accessor, request, config.services)) Authenticated(principal)
      else NotAuthorised("Method not allowed for this tier")
    }
    val auth = new Authentication(config, AuthenticationProviders(
      userProvider, mock[MachineAuthenticationProvider], innerProvider
    ), components.parsers.default, global)
    val permissionProvider = mock[AuthorisationProvider]
    when(permissionProvider.hasPermissionTo(DeleteImage, principal)).thenReturn(privileged)
    val authorisation = new Authorisation(permissionProvider, global)

    new MediaApi(auth, null, null, search, imageResponse, config, components,
      null, null, null, authorisation, null)
  }
}

class MediaApiTest extends AnyFunSpec with Matchers with ScalaFutures with MediaApiTestSupport {

  private val ordinaryUser = UserPrincipal("Test", "Uploader", "uploader@example.test")
  private val otherUser = UserPrincipal("Test", "Other", "other@example.test")

  private case class SearchAfterHarness(controller: MediaApi, search: ElasticSearch, captured: Future[SearchAfterParams])

  private def searchAfterHarness(principal: Principal, privileged: Boolean = false): SearchAfterHarness = {
    val search = mock[ElasticSearch]
    val captured = Promise[SearchAfterParams]()
    when(search.searchAfter(any[SearchAfterParams])(any[ExecutionContext], any[LogMarker])).thenAnswer { invocation =>
      captured.success(invocation.getArgument[SearchAfterParams](0))
      Future.successful(SearchAfterRawResults(Nil, 0L, Nil, None, None))
    }
    val controller = mediaApiFor(principal, search, mock[ImageResponse], privileged)

    SearchAfterHarness(controller, search, captured.future)
  }

  describe("D3 deleted search authorization") {
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")))

    Seq("is:deleted", " is:deleted ", "keyword:fixture is:deleted", "is:deleted -is:archived",
      "is:DELETED", "is:DELETED -is:deletedx", "is:\"deleted\"", "is:'deleted'").foreach { query =>
      Seq(ordinaryUser, otherUser).foreach { principal =>
        it(s"scopes $query to the uploader ${principal.firstName} ${principal.lastName}") {
          val harness = searchAfterHarness(principal)
          val request = FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj(
            "q" -> query, "uploadedBy" -> "someone-else@example.test", "countAll" -> true
          ))

          harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 200
          harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(principal.email)
          harness.captured.futureValue.searchParams.countAll shouldBe Some(true)
        }
      }
    }

    it("preserves a privileged user's requested uploader") {
      val harness = searchAfterHarness(ordinaryUser, privileged = true)
      val request = FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj(
        "q" -> "keyword:fixture is:deleted", "uploadedBy" -> otherUser.email
      ))

      harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 200
      harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(otherUser.email)
    }

    Seq(Json.obj(), Json.obj("q" -> ""), Json.obj("q" -> "-is:deleted"), Json.obj("q" -> "keyword:fixture")).foreach { query =>
      it(s"does not impose uploader scope without positive deleted intent: $query") {
        val harness = searchAfterHarness(ordinaryUser)
        val request = FakeRequest("POST", "/images/search-after").withBody(body ++ query)

        harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 200
        harness.captured.futureValue.searchParams.uploadedBy shouldBe None
      }
    }

    Seq(ReadOnly, Syndication).foreach { tier =>
      it(s"preserves POST denial for the $tier machine tier") {
        val harness = searchAfterHarness(MachinePrincipal(ApiAccessor("test-machine", tier)))
        val request = FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj("q" -> "is:deleted"))

        harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 403
        verifyNoInteractions(harness.search)
      }
    }
  }

  describe("MediaApi.shouldSkipUsageRecording") {
    it("skips recording when the URI is a download and the user is the InDesign API key") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/download",
        user = MediaApi.InDesignIdentity
      ) shouldBe true
    }

    it("does not skip recording for a download from a real user") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/download",
        user = "some-real-user@guardian.co.uk"
      ) shouldBe false
    }

    it("does not skip recording for a syndication request, even from the InDesign API key") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/syndication",
        user = MediaApi.InDesignIdentity
      ) shouldBe false
    }

    it("does not skip recording for a syndication request from a real user") {
      MediaApi.shouldSkipUsageRecording(
        uri = "https://usage.example.com/usages/syndication",
        user = "some-real-user@guardian.co.uk"
      ) shouldBe false
    }
  }
}
