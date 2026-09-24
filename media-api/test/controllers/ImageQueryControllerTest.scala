package controllers

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth._
import com.gu.mediaservice.lib.logging.LogMarker
import lib.ImageResponse
import lib.elasticsearch.{ElasticSearch, SearchAfterParams, SearchAfterRawResults}
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.{verifyNoInteractions, when}
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.Json
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
}
