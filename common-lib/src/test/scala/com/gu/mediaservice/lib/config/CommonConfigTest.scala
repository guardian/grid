package com.gu.mediaservice.lib.config

import org.mockito.Mockito.when
import org.scalatest.funsuite.AnyFunSuiteLike
import org.scalatest.matchers.should.Matchers.convertToAnyShouldWrapper
import org.scalatestplus.mockito.MockitoSugar
import play.api.Configuration

class CommonConfigTest extends AnyFunSuiteLike with MockitoSugar {

  private val commonConf = mock[CommonConfig]
  when(commonConf.configuration).thenReturn(Configuration(
    "setAsCommaSepString" -> "a, b,c",
    "setAsActualArray" -> Set("a", "b", "c")
  ))

  test("testGetOptionalStringSet") {
      commonConf.getOptionalStringSet("doesnt.exist") shouldBe None
      commonConf.getOptionalStringSet("setAsCommaSepString") shouldBe Some(Set("a", "b", "c"))
      commonConf.getOptionalStringSet("setAsActualArray") shouldBe Some(Set("a", "b", "c"))
  }

  test("testGetStringSet") {
    commonConf.getStringSet("doesnt.exist") shouldBe Set.empty
    commonConf.getStringSet("setAsCommaSepString") shouldBe Set("a", "b", "c")
    commonConf.getStringSet("setAsActualArray") shouldBe Set("a", "b", "c")
  }

  test("imgproxy defaults to a path on imgops, including an overridden imgops base URI") {
    val defaults = new Services("test.dev-gutools.co.uk", ServiceHosts.guardianPrefixes, Set.empty)
    defaults.imgproxyBaseUri shouldBe "https://media-imgops.test.dev-gutools.co.uk/imgproxy"

    val overridden = new Services("example.com", ServiceHosts.guardianPrefixes, Set.empty,
      imgopsBaseUriOverride = Some("https://images.example.com/"))
    overridden.imgproxyBaseUri shouldBe "https://images.example.com/imgproxy"
  }

  test("an explicit imgproxy base URI preserves dedicated-host deployments") {
    val services = new Services("example.com", ServiceHosts.guardianPrefixes, Set.empty,
      imgproxyBaseUriOverride = Some("https://imgproxy.example.com"))
    services.imgproxyBaseUri shouldBe "https://imgproxy.example.com"
  }

}
