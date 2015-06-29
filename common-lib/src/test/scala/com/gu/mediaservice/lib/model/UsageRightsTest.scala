package com.gu.mediaservice.model

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json._


class UsageRightsTest extends FunSpec with Matchers {

  it ("Validate on empty usage rights") {
    val usageRights = UsageRights(None)

    isValid(usageRights) should be (true)
  }

  it ("should be valid with free category and no restrictions") {
    val usageRights = UsageRights(Some(Handout))

    isValid(usageRights) should be (true)
  }

  it ("should be invalid with restricted category and no restrictions") {
    val usageRights = UsageRights(Some(PrImage))
    isValid(usageRights) should be (false)
  }

  it ("should be invalid as a staff photographer with no photographer") {
    val usageRights = UsageRights(Some(StaffPhotographer))
    isValid(usageRights) should be (false)
  }



  def isValid(usageRights: UsageRights): Boolean =
    UsageRights.validate(usageRights).fold(
      errors =>  false,
      valid => true
    )

}


