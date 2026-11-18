package com.gu.mediaservice.lib.auth

import org.scalatest.funspec.AnyFunSpec

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
}
