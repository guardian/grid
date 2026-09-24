package controllers

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.logging.LogMarker
import lib.ImageResponse
import lib.elasticsearch.{ElasticSearch, ImageWindowParams, ImageWindowRawResults, SearchAfterParams, SearchAfterRawResults}
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{verifyNoInteractions, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.http.HttpEntity
import play.api.libs.json.{JsNull, JsNumber, JsObject, JsString, JsValue, Json}
import play.api.mvc.Result
import play.api.test.FakeRequest

import scala.concurrent.{ExecutionContext, Future, Promise}

class ImageQueryControllerTest extends AnyFunSpec with Matchers with ScalaFutures with MediaApiTestSupport {

  private val ordinaryUser = UserPrincipal("Test", "Uploader", "uploader@example.test")
  private val otherUser = UserPrincipal("Test", "Other", "other@example.test")

  private case class SearchAfterHarness(controller: ImageQueryController, search: ElasticSearch, captured: Future[SearchAfterParams])

  private def searchAfterHarness(principal: Principal, privileged: Boolean = false): SearchAfterHarness = {
    val search = mock[ElasticSearch]
    val captured = Promise[SearchAfterParams]()
    when(search.searchAfter(any[SearchAfterParams])(any[ExecutionContext], any[LogMarker])).thenAnswer { invocation =>
      captured.success(invocation.getArgument[SearchAfterParams](0))
      Future.successful(SearchAfterRawResults(Nil, 0L, Nil, None, None))
    }
    val controller = imageQueryControllerFor(principal, search, mock[ImageResponse], privileged)

    SearchAfterHarness(controller, search, captured.future)
  }

  describe("D3 deleted search authorization") {
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")))

    Seq("is:deleted", " is:deleted ", "keyword:fixture is:deleted", "is:deleted -is:archived",
      "is:DELETED", "is:DELETED -is:deletedx", "is:\"deleted\"", "is:'deleted'").foreach { query =>
      Seq(ordinaryUser, otherUser).foreach { principal =>
        it(s"scopes $query to the uploader ${principal.firstName} ${principal.lastName}") {
          val harness = searchAfterHarness(principal)
          val request = FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj(
            "q" -> query, "uploadedBy" -> "someone-else@example.test", "countAll" -> true
          ))

          harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 200
          harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(principal.email)
          harness.captured.futureValue.searchParams.countAll shouldBe Some(true)
        }
      }
    }

    it("preserves a privileged user's requested uploader") {
      val harness = searchAfterHarness(ordinaryUser, privileged = true)
      val request = FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj(
        "q" -> "keyword:fixture is:deleted", "uploadedBy" -> otherUser.email
      ))

      harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 200
      harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(otherUser.email)
    }

    Seq(Json.obj(), Json.obj("q" -> ""), Json.obj("q" -> "-is:deleted"), Json.obj("q" -> "keyword:fixture")).foreach { query =>
      it(s"does not impose uploader scope without positive deleted intent: $query") {
        val harness = searchAfterHarness(ordinaryUser)
        val request = FakeRequest("POST", "/images/search-after").withBody(body ++ query)

        harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 200
        harness.captured.futureValue.searchParams.uploadedBy shouldBe None
      }
    }

    Seq(ReadOnly, Syndication).foreach { tier =>
      it(s"preserves POST denial for the $tier machine tier") {
        val harness = searchAfterHarness(MachinePrincipal(ApiAccessor("test-machine", tier)))
        val request = FakeRequest("POST", "/images/search-after").withBody(body ++ Json.obj("q" -> "is:deleted"))

        harness.controller.searchAfterImages().apply(request).futureValue.header.status shouldBe 403
        verifyNoInteractions(harness.search)
      }
    }
  }

  private case class WindowHarness(controller: ImageQueryController, search: ElasticSearch, captured: Future[ImageWindowParams])

  private def windowHarness(
    principal: Principal,
    privileged: Boolean = false,
    result: ImageWindowRawResults = ImageWindowRawResults(Nil, Nil, Some(0L), 0, None),
  ): WindowHarness = {
    val search = mock[ElasticSearch]
    val captured = Promise[ImageWindowParams]()
    when(search.imageWindow(any[ImageWindowParams])(any[ExecutionContext], any[LogMarker])).thenAnswer { invocation =>
      captured.success(invocation.getArgument[ImageWindowParams](0))
      Future.successful(result)
    }
    WindowHarness(imageQueryControllerFor(principal, search, mock[ImageResponse], privileged), search, captured.future)
  }

  private def windowRequest(body: JsObject) = FakeRequest("POST", "/images/window").withBody(body)

  private def jsonOf(result: Result): JsValue =
    Json.parse(result.body.asInstanceOf[HttpEntity.Strict].data.utf8String)

  describe("window admission") {
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")))

    Seq("is:deleted", "keyword:fixture is:deleted", "is:DELETED", "is:\"deleted\"").foreach { query =>
      Seq(ordinaryUser, otherUser).foreach { principal =>
        it(s"scopes $query to the uploader ${principal.firstName} ${principal.lastName}, as D3 does") {
          val harness = windowHarness(principal)
          val request = windowRequest(body ++ Json.obj("q" -> query, "uploadedBy" -> "someone-else@example.test"))

          harness.controller.windowImages().apply(request).futureValue.header.status shouldBe 200
          harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(principal.email)
        }
      }
    }

    it("preserves a privileged user's requested uploader") {
      val harness = windowHarness(ordinaryUser, privileged = true)
      val request = windowRequest(body ++ Json.obj("q" -> "is:deleted", "uploadedBy" -> otherUser.email))

      harness.controller.windowImages().apply(request).futureValue.header.status shouldBe 200
      harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(otherUser.email)
    }

    it("does not impose uploader scope without positive deleted intent") {
      val harness = windowHarness(ordinaryUser)

      harness.controller.windowImages().apply(windowRequest(body ++ Json.obj("q" -> "-is:deleted"))).futureValue.header.status shouldBe 200
      harness.captured.futureValue.searchParams.uploadedBy shouldBe None
    }

    Seq(ReadOnly, Syndication).foreach { tier =>
      it(s"preserves POST denial for the $tier machine tier") {
        val harness = windowHarness(MachinePrincipal(ApiAccessor("test-machine", tier)))

        harness.controller.windowImages().apply(windowRequest(body)).futureValue.header.status shouldBe 403
        verifyNoInteractions(harness.search)
      }
    }

    Seq(
      "sortValues" -> Json.obj("sortValues" -> Json.arr(1700000000000L, "an-id")),
      "reverse" -> Json.obj("reverse" -> true),
      "seekToEnd" -> Json.obj("seekToEnd" -> true),
    ).foreach { case (field, cursorField) =>
      it(s"refuses the cursor field $field before reaching Elasticsearch") {
        val harness = windowHarness(ordinaryUser)
        val result = harness.controller.windowImages().apply(windowRequest(body ++ cursorField)).futureValue

        result.header.status shouldBe 400
        (jsonOf(result) \ "errorMessage").as[String] should include(field)
        verifyNoInteractions(harness.search)
      }
    }

    it("accepts the default values of cursor fields") {
      val harness = windowHarness(ordinaryUser)
      val request = windowRequest(body ++ Json.obj("sortValues" -> JsNull, "reverse" -> false, "seekToEnd" -> false))

      harness.controller.windowImages().apply(request).futureValue.header.status shouldBe 200
    }

    it("refuses more than 200 images per request before reaching Elasticsearch") {
      val harness = windowHarness(ordinaryUser)

      harness.controller.windowImages().apply(windowRequest(body ++ Json.obj("length" -> 201))).futureValue.header.status shouldBe 422
      verifyNoInteractions(harness.search)
    }

    it("passes offset, length, sort and PIT to Elasticsearch") {
      val harness = windowHarness(ordinaryUser)
      val request = windowRequest(body ++ Json.obj("offset" -> 9999, "length" -> 200, "pitId" -> "a-pit"))

      harness.controller.windowImages().apply(request).futureValue.header.status shouldBe 200
      val params = harness.captured.futureValue
      params.searchParams.offset shouldBe 9999
      params.searchParams.length shouldBe 200
      params.sort shouldBe Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      params.pitId shouldBe Some("a-pit")
    }
  }

  describe("window response") {
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")), "offset" -> 40)
    val tuple = Seq[JsValue](JsNumber(1700000000000L), JsString("an-id"))

    it("reports offset, tuples, raw hit count, PIT and a counted total") {
      val harness = windowHarness(ordinaryUser, result = ImageWindowRawResults(Nil, Seq(tuple), Some(1234L), 3, Some("refreshed-pit")))
      val json = jsonOf(harness.controller.windowImages().apply(windowRequest(body)).futureValue)

      (json \ "data").as[Seq[JsValue]] shouldBe empty
      (json \ "offset").as[Int] shouldBe 40
      (json \ "total").as[Long] shouldBe 1234L
      (json \ "sortValues").as[Seq[Seq[JsValue]]] shouldBe Seq(tuple)
      (json \ "rawHitCount").as[Int] shouldBe 3
      (json \ "pitId").as[String] shouldBe "refreshed-pit"
    }

    it("omits total when the request did not count") {
      val harness = windowHarness(ordinaryUser, result = ImageWindowRawResults(Nil, Nil, None, 0, None))
      val json = jsonOf(harness.controller.windowImages().apply(windowRequest(body ++ Json.obj("countAll" -> false))).futureValue)

      (json \ "total").toOption shouldBe None
      (json \ "rawHitCount").as[Int] shouldBe 0
    }
  }
}
