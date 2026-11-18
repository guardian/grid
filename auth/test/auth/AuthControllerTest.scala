package auth

import com.gu.mediaservice.lib.auth.{Authentication, Authorisation}
import com.gu.mediaservice.lib.auth.provider.AuthenticationProviders
import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import org.mockito.Mockito.when
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatestplus.mockito.MockitoSugar
import play.api.test.Helpers.stubControllerComponents

import scala.concurrent.ExecutionContext.Implicits.global

class AuthControllerTest extends AnyFunSpec with Matchers with MockitoSugar {

  private def controller(domainRoot: String): AuthController = {
    val config = mock[AuthConfig]
    val services = new Services("example.test", ServiceHosts.guardianPrefixes, Set.empty)
    when(config.domainRoot).thenReturn(domainRoot)
    when(config.services).thenReturn(services)
    when(config.mediaApiUri).thenReturn(services.apiBaseUri)
    when(config.rootUri).thenReturn(services.authBaseUri)

    new AuthController(
      mock[Authentication],
      mock[AuthenticationProviders],
      config,
      stubControllerComponents(),
      mock[Authorisation]
    )
  }

  describe("login redirect validation") {
    it("accepts HTTPS redirects to the configured domain and its subdomains") {
      val auth = controller("example.test")
      Seq(
        "https://example.test/",
        "https://media.example.test/images?query=test",
        "https://nested.media.example.test/"
      ).foreach(uri => auth.isValidDomain(uri) shouldBe true)
    }

    it("rejects unrelated hosts that share the configured suffix") {
      val auth = controller("example.test")
      Seq(
        "https://evil-example.test/",
        "https://notexample.test/",
        "https://example.test.attacker.test/",
        "https://example.test@attacker.test/"
      ).foreach(uri => auth.isValidDomain(uri) shouldBe false)
    }

    it("compares DNS hostnames without case sensitivity") {
      controller("EXAMPLE.TEST").isValidDomain("https://media.example.test/") shouldBe true
      controller("example.test").isValidDomain("https://MEDIA.EXAMPLE.TEST/") shouldBe true
    }

    it("preserves subdomain-only matching for a leading-dot root") {
      val auth = controller(".example.test")
      auth.isValidDomain("https://media.example.test/") shouldBe true
      auth.isValidDomain("https://example.test/") shouldBe false
      auth.isValidDomain("https://evil-example.test/") shouldBe false
    }

    it("rejects insecure, relative and malformed redirects") {
      val auth = controller("example.test")
      Seq(
        "http://media.example.test/",
        "//media.example.test/",
        "/images",
        "https:///images",
        "not a URI"
      ).foreach(uri => auth.isValidDomain(uri) shouldBe false)
    }
  }
}
