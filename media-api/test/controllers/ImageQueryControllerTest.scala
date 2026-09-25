package controllers

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.logging.LogMarker
import lib.ImageResponse
import lib.elasticsearch.{DateStats, DateStatsResult, ElasticSearch, ImageRankIncomplete, ImageRankParams, ImageRankRawResults, ImageWindowParams, ImageWindowRawResults, ScalarAnchor, SearchAfterParams, SearchAfterRawResults, SortProfileIncomplete, SortProfileParams, SortProfileRawResults}
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

  private case class RankHarness(controller: ImageQueryController, search: ElasticSearch, captured: Future[ImageRankParams])

  private def rankHarness(
    principal: Principal,
    privileged: Boolean = false,
    result: Future[ImageRankRawResults] = Future.successful(ImageRankRawResults(0L, None)),
  ): RankHarness = {
    val search = mock[ElasticSearch]
    val captured = Promise[ImageRankParams]()
    when(search.imageRank(any[ImageRankParams])(any[ExecutionContext], any[LogMarker])).thenAnswer { invocation =>
      captured.success(invocation.getArgument[ImageRankParams](0))
      result
    }
    RankHarness(imageQueryControllerFor(principal, search, mock[ImageResponse], privileged), search, captured.future)
  }

  private def rankRequest(body: JsObject) = FakeRequest("POST", "/images/rank").withBody(body)

  describe("rank admission") {
    val tuple = Json.arr(1700000000000L, "an-id")
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")), "sortValues" -> tuple)

    Seq("is:deleted", "keyword:fixture is:deleted").foreach { query =>
      Seq(ordinaryUser, otherUser).foreach { principal =>
        it(s"scopes $query to the uploader ${principal.firstName} ${principal.lastName}, as D3 does") {
          val harness = rankHarness(principal)
          val request = rankRequest(body ++ Json.obj("q" -> query, "uploadedBy" -> "someone-else@example.test"))

          harness.controller.rankImages().apply(request).futureValue.header.status shouldBe 200
          harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(principal.email)
        }
      }
    }

    it("preserves a privileged user's requested uploader") {
      val harness = rankHarness(ordinaryUser, privileged = true)
      val request = rankRequest(body ++ Json.obj("q" -> "is:deleted", "uploadedBy" -> otherUser.email))

      harness.controller.rankImages().apply(request).futureValue.header.status shouldBe 200
      harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(otherUser.email)
    }

    Seq(ReadOnly, Syndication).foreach { tier =>
      it(s"preserves POST denial for the $tier machine tier") {
        val harness = rankHarness(MachinePrincipal(ApiAccessor("test-machine", tier)))

        harness.controller.rankImages().apply(rankRequest(body)).futureValue.header.status shouldBe 403
        verifyNoInteractions(harness.search)
      }
    }

    Seq("reverse" -> Json.obj("reverse" -> true), "seekToEnd" -> Json.obj("seekToEnd" -> true)).foreach {
      case (field, orderingField) =>
        it(s"refuses $field, which would change what 'before' means, before reaching Elasticsearch") {
          val harness = rankHarness(ordinaryUser)
          val result = harness.controller.rankImages().apply(rankRequest(body ++ orderingField)).futureValue

          result.header.status shouldBe 400
          (jsonOf(result) \ "errorMessage").as[String] should include(field)
          verifyNoInteractions(harness.search)
        }
    }

    it("accepts the default values of ordering fields") {
      val harness = rankHarness(ordinaryUser)
      val request = rankRequest(body ++ Json.obj("reverse" -> false, "seekToEnd" -> false))

      harness.controller.rankImages().apply(request).futureValue.header.status shouldBe 200
    }

    Seq("length" -> Json.obj("length" -> 201), "offset" -> Json.obj("offset" -> -1)).foreach { case (field, invalid) =>
      it(s"validates $field exactly as D3 and window do, although rank does not use it") {
        val harness = rankHarness(ordinaryUser)

        harness.controller.rankImages().apply(rankRequest(body ++ invalid)).futureValue.header.status shouldBe 422
        verifyNoInteractions(harness.search)
      }
    }

    Seq("absent" -> (body - "sortValues"), "null" -> (body ++ Json.obj("sortValues" -> JsNull))).foreach {
      case (state, withoutTuple) =>
        it(s"refuses a request whose sortValues is $state before reaching Elasticsearch") {
          val harness = rankHarness(ordinaryUser)
          val result = harness.controller.rankImages().apply(rankRequest(withoutTuple)).futureValue

          result.header.status shouldBe 400
          (jsonOf(result) \ "errorMessage").as[String] should include("sortValues")
          verifyNoInteractions(harness.search)
        }
    }

    it("passes sort, the tuple (including nulls) and PIT to Elasticsearch") {
      val harness = rankHarness(ordinaryUser)
      val nullZoneTuple = Json.arr(JsNull, 1700000000000L, "an-id")
      val request = rankRequest(body ++ Json.obj("sortValues" -> nullZoneTuple, "pitId" -> "a-pit"))

      harness.controller.rankImages().apply(request).futureValue.header.status shouldBe 200
      val params = harness.captured.futureValue
      params.sort shouldBe Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      params.sortValues shouldBe nullZoneTuple.value.toSeq
      params.pitId shouldBe Some("a-pit")
    }
  }

  describe("rank response") {
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")),
      "sortValues" -> Json.arr(1700000000000L, "an-id"))

    it("reports the rank and a PIT when one is returned") {
      val harness = rankHarness(ordinaryUser, result = Future.successful(ImageRankRawResults(6100L, Some("refreshed-pit"))))
      val json = jsonOf(harness.controller.rankImages().apply(rankRequest(body)).futureValue)

      json shouldBe Json.obj("rank" -> 6100L, "pitId" -> "refreshed-pit")
    }

    it("omits pitId without a PIT") {
      val harness = rankHarness(ordinaryUser, result = Future.successful(ImageRankRawResults(0L, None)))

      jsonOf(harness.controller.rankImages().apply(rankRequest(body)).futureValue) shouldBe Json.obj("rank" -> 0L)
    }

    it("responds 503 rather than publishing an incomplete count") {
      val harness = rankHarness(ordinaryUser, result = Future.failed(ImageRankIncomplete))
      val result = harness.controller.rankImages().apply(rankRequest(body)).futureValue

      result.header.status shouldBe 503
      (jsonOf(result) \ "errorKey").as[String] shouldBe "rank-incomplete"
    }
  }

  private case class SortProfileHarness(controller: ImageQueryController, search: ElasticSearch, captured: Future[SortProfileParams])

  private def sortProfileHarness(
    principal: Principal,
    privileged: Boolean = false,
    result: Future[SortProfileRawResults] = Future.successful(SortProfileRawResults(DateStatsResult(0L, None, None, None), None)),
  ): SortProfileHarness = {
    val search = mock[ElasticSearch]
    val captured = Promise[SortProfileParams]()
    when(search.sortProfile(any[SortProfileParams])(any[ExecutionContext], any[LogMarker])).thenAnswer { invocation =>
      captured.success(invocation.getArgument[SortProfileParams](0))
      result
    }
    SortProfileHarness(imageQueryControllerFor(principal, search, mock[ImageResponse], privileged), search, captured.future)
  }

  private def sortProfileRequest(body: JsObject) = FakeRequest("POST", "/images/sort-profile").withBody(body)

  describe("sort profile admission") {
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")),
      "operation" -> "date-stats", "field" -> "uploadTime")

    Seq(ordinaryUser, otherUser).foreach { principal =>
      it(s"scopes is:deleted to the uploader ${principal.firstName} ${principal.lastName}, as D3 does") {
        val harness = sortProfileHarness(principal)
        val request = sortProfileRequest(body ++ Json.obj("q" -> "is:deleted", "uploadedBy" -> "someone-else@example.test"))

        harness.controller.sortProfile().apply(request).futureValue.header.status shouldBe 200
        harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(principal.email)
      }
    }

    it("preserves a privileged user's requested uploader") {
      val harness = sortProfileHarness(ordinaryUser, privileged = true)
      val request = sortProfileRequest(body ++ Json.obj("q" -> "is:deleted", "uploadedBy" -> otherUser.email))

      harness.controller.sortProfile().apply(request).futureValue.header.status shouldBe 200
      harness.captured.futureValue.searchParams.uploadedBy shouldBe Some(otherUser.email)
    }

    Seq(ReadOnly, Syndication).foreach { tier =>
      it(s"preserves POST denial for the $tier machine tier") {
        val harness = sortProfileHarness(MachinePrincipal(ApiAccessor("test-machine", tier)))

        harness.controller.sortProfile().apply(sortProfileRequest(body)).futureValue.header.status shouldBe 403
        verifyNoInteractions(harness.search)
      }
    }

    it("validates length exactly as D3 and window do, although profiles do not use it") {
      val harness = sortProfileHarness(ordinaryUser)

      harness.controller.sortProfile().apply(sortProfileRequest(body ++ Json.obj("length" -> 201))).futureValue.header.status shouldBe 422
      verifyNoInteractions(harness.search)
    }

    it("refuses a cursor before reaching Elasticsearch") {
      val harness = sortProfileHarness(ordinaryUser)
      val result = harness.controller.sortProfile().apply(sortProfileRequest(body ++ Json.obj("sortValues" -> Json.arr(0, "x")))).futureValue

      result.header.status shouldBe 400
      verifyNoInteractions(harness.search)
    }

    it("passes the operation, its scope, sort and PIT to Elasticsearch") {
      val harness = sortProfileHarness(ordinaryUser)
      val request = sortProfileRequest(body ++ Json.obj("operation" -> "scalar-anchor", "percentile" -> 12.5,
        "scope" -> Json.arr(Json.obj("field" -> "metadata.credit", "value" -> "AAP")), "pitId" -> "a-pit"))

      harness.controller.sortProfile().apply(request).futureValue.header.status shouldBe 200
      val params = harness.captured.futureValue
      params.operation shouldBe ScalarAnchor("uploadTime", 12.5, Seq("metadata.credit" -> "AAP"))
      params.sort shouldBe Seq(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc"))
      params.pitId shouldBe Some("a-pit")
    }

    it("passes an optional missing field") {
      val harness = sortProfileHarness(ordinaryUser)
      val request = sortProfileRequest(body ++ Json.obj("field" -> "uploadTime", "missingField" -> "metadata.dateTaken"))

      harness.controller.sortProfile().apply(request).futureValue.header.status shouldBe 200
      harness.captured.futureValue.operation shouldBe DateStats("uploadTime", Some("metadata.dateTaken"))
    }
  }

  describe("sort profile response") {
    val body = Json.obj("sort" -> Json.arr(Json.obj("uploadTime" -> "desc"), Json.obj("id" -> "asc")),
      "operation" -> "date-stats", "field" -> "uploadTime")

    it("reports the profile and a PIT when one is returned") {
      val harness = sortProfileHarness(ordinaryUser,
        result = Future.successful(SortProfileRawResults(DateStatsResult(3L, Some(1L), Some(9L), Some(2L)), Some("refreshed-pit"))))

      jsonOf(harness.controller.sortProfile().apply(sortProfileRequest(body)).futureValue) shouldBe
        Json.obj("valueCount" -> 3L, "min" -> 1L, "max" -> 9L, "coveredCount" -> 2L, "pitId" -> "refreshed-pit")
    }

    it("responds 503 rather than publishing an incomplete profile") {
      val harness = sortProfileHarness(ordinaryUser, result = Future.failed(SortProfileIncomplete))
      val result = harness.controller.sortProfile().apply(sortProfileRequest(body)).futureValue

      result.header.status shouldBe 503
      (jsonOf(result) \ "errorKey").as[String] shouldBe "sort-profile-incomplete"
    }
  }
}
