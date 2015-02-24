package com.gu.mediaservice.lib.cleanup

import org.scalatest.{FunSpec, Matchers}

class UseCanonicalGuardianCreditTest extends FunSpec with Matchers with MetadataHelper {

  it("should not change a non-Guardian credit") {
    val metadata = createImageMetadata("credit" -> "Getty Images")
    UseCanonicalGuardianCredit.clean(metadata).credit should be (Some("Getty Images"))
  }

  it("should not change a 'The Guardian' credit") {
    val metadata = createImageMetadata("credit" -> "The Guardian")
    UseCanonicalGuardianCredit.clean(metadata).credit should be (Some("The Guardian"))
  }

  it("should change a 'Guardian' credit") {
    val metadata = createImageMetadata("credit" -> "Guardian")
    UseCanonicalGuardianCredit.clean(metadata).credit should be (Some("The Guardian"))
  }

}
