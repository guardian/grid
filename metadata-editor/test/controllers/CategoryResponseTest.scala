package controllers

import com.gu.mediaservice.model.{Agency, Chargeable, PayToUse, PublisherPhotographer, StaffPhotographer}
import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers

class CategoryResponseTest extends AnyFreeSpec with Matchers {
  "legacyCategoriesOf" - {
    "lists the stored values a replacement category stands for, so clients can count it" in {
      CategoryResponse.legacyCategoriesOf(PayToUse) shouldBe List(Chargeable.category)
      CategoryResponse.legacyCategoriesOf(PublisherPhotographer) should contain(StaffPhotographer.category)
    }

    "is empty for ordinary categories" in {
      CategoryResponse.legacyCategoriesOf(Agency) shouldBe Nil
    }
  }
}
