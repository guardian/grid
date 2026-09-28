package controllers

import com.gu.mediaservice.lib.auth.Authentication.Principal
import com.gu.mediaservice.lib.auth.Permissions.DeleteImage
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.auth.provider._
import com.gu.mediaservice.lib.aws.Embedder
import com.gu.mediaservice.lib.config.ServiceHosts
import lib.{ImageResponse, MediaApiConfig}
import lib.elasticsearch.ElasticSearch
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.when
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.mvc.{ControllerComponents, RequestHeader}
import play.api.test.Helpers

import scala.concurrent.ExecutionContext.Implicits.global

trait MediaApiTestSupport extends MockitoSugar {
  private case class ControllerDeps(config: MediaApiConfig, components: ControllerComponents, auth: Authentication, authorisation: Authorisation)

  private def controllerDeps(principal: Principal, privileged: Boolean): ControllerDeps = {
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
    ControllerDeps(config, components, auth, authorisation)
  }

  protected def mediaApiFor(principal: Principal, search: ElasticSearch, imageResponse: ImageResponse, privileged: Boolean = false,
                            embedder: Embedder = null, configure: MediaApiConfig => Unit = _ => ()): MediaApi = {
    val deps = controllerDeps(principal, privileged)
    configure(deps.config)
    new MediaApi(deps.auth, null, null, search, imageResponse, deps.config, null, deps.components,
      null, null, null, deps.authorisation, embedder)
  }

  protected def imageQueryControllerFor(principal: Principal, search: ElasticSearch, imageResponse: ImageResponse, privileged: Boolean = false): ImageQueryController = {
    val deps = controllerDeps(principal, privileged)
    new ImageQueryController(deps.auth, search, imageResponse, deps.config, deps.authorisation, deps.components)
  }
}

class MediaApiTest extends AnyFunSpec with Matchers {

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
