package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.auth.Permissions
import org.scalatest.funspec.AnyFunSpec
import org.scalatestplus.mockito.MockitoSugar.mock
import org.mockito.Mockito.when
import play.api.mvc.RequestHeader

class ApiAccessorTest extends AnyFunSpec {
  describe("ApiAccessor") {
    describe("v1 key format") {
      it("ApiAccessor should parse a key without a tier") {
        val key = "name"
        val apiAccessor = ApiAccessor(key)
        assert(apiAccessor.identity == "name")
        assert(apiAccessor.tier == Internal)
      }
      it("ApiAccessor should parse a key with a tier") {
        val key = "name\nsyndication"
        val apiAccessor = ApiAccessor(key)
        assert(apiAccessor.identity == "name")
        assert(apiAccessor.tier == Syndication)
      }
      it("ApiAccessor should parse a key with an unknown tier") {
        val key = "name\nunknown"
        val apiAccessor = ApiAccessor(key)
        assert(apiAccessor.identity == "name")
        assert(apiAccessor.tier == ReadOnly)
      }
    }

    describe("v2 key format") {
      it("ApiAccessor should parse a key with a tier") {
        val apiAccessor = ApiAccessor(TestKeys.v2KeyWithPermissions)
        assert(apiAccessor.identity == "name")
        assert(apiAccessor.tier == PermissionTier(List(Permissions.EditMetadata, Permissions.GridAccess)))
        assert(apiAccessor.expiresAt.contains(java.time.Instant.parse("2027-02-01T00:00:00Z")))
      }
      it("ApiAccessor should parse a key with an empty permissions") {
        val apiAccessor = ApiAccessor(TestKeys.v2KeyNoPermissions)
        assert(apiAccessor.identity == "name")
        assert(apiAccessor.tier == PermissionTier(Nil))
      }
    }

    describe("hasAccess") {
      def mockRequest(method: String, host: String, path: String): RequestHeader = {
        val request = mock[RequestHeader]
        when(request.method).thenReturn(method)
        when(request.host).thenReturn(host)
        when(request.path).thenReturn(path)
        request
      }

      it("should allow Administrator tier access to any request") {
        val apiAccessor = ApiAccessor("administrator-user", Administrator)
        val request = mockRequest("DELETE", "api.example.com", "/images/some-image")
        val services = mock[Services]
        when(services.apiHost).thenReturn("api.example.com")
        assert(ApiAccessor.hasAccess(apiAccessor, request, services))
      }
      it("should allow Internal tier access to any POST request") {
        val apiAccessor = ApiAccessor("internal-user", Internal)
        val request = mockRequest("POST", "api.example.com", "/images/some-image")
        val services = mock[Services]
        when(services.apiHost).thenReturn("api.example.com")
        assert(ApiAccessor.hasAccess(apiAccessor, request, services))
      }
      it("should deny Internal tier access to any request if the tier is Internal") {
        val apiAccessor = ApiAccessor("internal-user", Internal)
        val request = mockRequest("DELETE", "api.example.com", "/images/some-image")
        val services = mock[Services]
        when(services.apiHost).thenReturn("api.example.com")
        assert(!ApiAccessor.hasAccess(apiAccessor, request, services))
      }
      it("should allow ReadOnly tier access to GET requests") {
        val apiAccessor = ApiAccessor("readonly-user", ReadOnly)
        val request = mockRequest("GET", "api.example.com", "/images/some-image")
        val services = mock[Services]
        when(services.apiHost).thenReturn("api.example.com")
        assert(ApiAccessor.hasAccess(apiAccessor, request, services))
      }
      it("should deny ReadOnly tier access to non-GET requests") {
        val apiAccessor = ApiAccessor("readonly-user", ReadOnly)
        val request = mockRequest("POST", "api.example.com", "/images/some-image")
        val services = mock[Services]
        when(services.apiHost).thenReturn("api.example.com")
        assert(!ApiAccessor.hasAccess(apiAccessor, request, services))
      }
      it("should allow Syndication tier access to GET requests on /images path from the correct host") {
        val apiAccessor = ApiAccessor("syndication-user", Syndication)
        val request = mockRequest("GET", "api.example.com", "/images/some-image")
        val services = mock[Services]
        when(services.apiHost).thenReturn("api.example.com")
        assert(ApiAccessor.hasAccess(apiAccessor, request, services))
      }
      it("should deny Syndication tier access to non-GET requests or incorrect paths or hosts") {
        val apiAccessor = ApiAccessor("syndication-user", Syndication)
        val invalidRequests = List(
          mockRequest("POST", "api.example.com", "/images/some-image"),
          mockRequest("GET", "api.example.com", "/other-path"),
          mockRequest("GET", "otherhost.com", "/images/some-image")
        )
        val services = mock[Services]
        when(services.apiHost).thenReturn("api.example.com")
        invalidRequests.foreach { request =>
          assert(!ApiAccessor.hasAccess(apiAccessor, request, services))
        }
      }
    }
  }
}
