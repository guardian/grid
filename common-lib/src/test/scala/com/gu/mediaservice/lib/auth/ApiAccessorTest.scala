package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.config.Services
import org.scalatest.funspec.AnyFunSpec
import org.scalatestplus.mockito.MockitoSugar.mock
import org.mockito.Mockito.when

import play.api.mvc.RequestHeader

class ApiAccessorTest extends AnyFunSpec  {

  describe("apply") {
    it("should parse a string with a name and tier into an ApiAccessor") {
      val content = "my-identity\nsyndication"
      val apiAccessor = ApiAccessor(content)
      assert(apiAccessor.identity == "my-identity")
      assert(apiAccessor.tier == Syndication)
    }
    it("should default to Internal tier if no tier is specified") {
      val content = "my-identity"
      val apiAccessor = ApiAccessor(content)
      assert(apiAccessor.identity == "my-identity")
      assert(apiAccessor.tier == Internal)
    }
    it("should default to ReadOnly tier if an unknown tier is specified") {
      val content = "my-identity\nunknown-tier"
      val apiAccessor = ApiAccessor(content)
      assert(apiAccessor.identity == "my-identity")
      assert(apiAccessor.tier == ReadOnly)
    }
    it("should default to Internal tier if the content is empty") {
      val content = ""
      val apiAccessor = ApiAccessor(content)
      assert(apiAccessor.identity == "")
      assert(apiAccessor.tier == Internal)
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
    it("should allow Administrator tier access to any request")   {
      val apiAccessor = ApiAccessor("administrator-user", Administrator)
      val request = mockRequest("DELETE", "api.example.com", "/images/some-image")
      val services = mock[Services]
      when(services.apiHost).thenReturn("api.example.com")
      assert(ApiAccessor.hasAccess(apiAccessor, request, services))
    }
    it("should allow Internal tier access to any POST request")   {
      val apiAccessor = ApiAccessor("internal-user", Internal)
      val request = mockRequest("POST", "api.example.com", "/images/some-image")
      val services = mock[Services]
      when(services.apiHost).thenReturn("api.example.com")
      assert(ApiAccessor.hasAccess(apiAccessor, request, services))
    }
    it("should deny Internal tier access to any request if the tier is not Internal")   {
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
