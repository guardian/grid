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

}
