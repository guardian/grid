package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.auth.Permissions
import org.scalatest.funspec.AnyFunSpec

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
  }
}
