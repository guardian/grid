package lib.elasticsearch

import com.sksamuel.elastic4s.requests.searches.sort.{FieldSort, SortOrder}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.{JsNumber, Json}

class SortsTest extends AnyFunSpec with Matchers {

  describe("jsonToSort") {
    it("reads the flat {field: direction} shape") {
      val sort = sorts.jsonToSort(Json.obj("uploadTime" -> "desc")).asInstanceOf[FieldSort]
      sort.field shouldBe "uploadTime"
      sort.order shouldBe SortOrder.DESC
    }

    it("reads the object shape with order, missing and mode") {
      val sort = sorts.jsonToSort(
        Json.obj("usages.dateAdded" -> Json.obj("order" -> "asc", "missing" -> "_last", "mode" -> "max"))
      ).asInstanceOf[FieldSort]
      sort.field shouldBe "usages.dateAdded"
      sort.order shouldBe SortOrder.ASC
    }

    it("rejects a sort order that is neither asc nor desc") {
      val ex = the[InvalidUriParams] thrownBy sorts.jsonToSort(Json.obj("uploadTime" -> "decs"))
      ex.message should include("decs")
    }

    it("rejects an empty sort entry") {
      a[InvalidUriParams] should be thrownBy sorts.jsonToSort(Json.obj())
    }

    it("rejects a sort entry naming more than one field") {
      a[InvalidUriParams] should be thrownBy sorts.jsonToSort(Json.obj("uploadTime" -> "desc", "id" -> "asc"))
    }

    it("rejects an object spec with no order") {
      a[InvalidUriParams] should be thrownBy sorts.jsonToSort(Json.obj("uploadTime" -> Json.obj("missing" -> "_last")))
    }

    it("rejects an object spec whose order is not a string") {
      a[InvalidUriParams] should be thrownBy sorts.jsonToSort(Json.obj("uploadTime" -> Json.obj("order" -> 1)))
    }

    it("rejects an unrecognised sort mode") {
      a[InvalidUriParams] should be thrownBy sorts.jsonToSort(
        Json.obj("uploadTime" -> Json.obj("order" -> "desc", "mode" -> "bogus"))
      )
    }

    it("rejects a spec that is neither a string nor an object") {
      a[InvalidUriParams] should be thrownBy sorts.jsonToSort(Json.obj("uploadTime" -> JsNumber(1)))
    }
  }
}
