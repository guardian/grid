package lib.elasticsearch

import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.Internal
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import lib.querysyntax.Parser
import play.api.libs.json.Json
import play.api.mvc.{AnyContentAsEmpty, Security}
import play.api.test.FakeRequest

class SearchParamsTest extends AnyFunSpec with Matchers {

  describe("POST admission uses the shared query parser") {
    Seq(
      "", "keyword:fixture", "is:DELETED", "is:\"deleted\"", "-is:deleted",
      "description:\"is:deleted\"", "usages@status:\"replaced\"",
      "-description:\"usages@status:replaced\"", "-usages@status:replacedx",
      "-usages@platform:print -usages@status:published", "credit:\"unfinished",
      "usages@section:news usages@publication:guardian usages@orderedBy:editor"
    ).foreach { query =>
      it(s"uses exactly the upstream conditions for $query") {
        val params = SearchParamsBody.fromJson(Json.obj("q" -> query), Internal).toOption.get
        params.structuredQuery shouldBe Parser.runResult(query).toOption.get
        params.queryParseError shouldBe None
      }
    }

    it("applies shared defaults when q is absent") {
      SearchParamsBody.fromJson(Json.obj(), Internal).toOption.get.structuredQuery shouldBe Parser.run("")
    }

    Seq("cats\tdogs", "is:deleted\t").foreach { query =>
      it(s"returns a decoding failure rather than throwing for ${query.replace("\t", "<tab>")}") {
        Parser.runResult(query).isLeft shouldBe true
        SearchParamsBody.fromJson(Json.obj("q" -> query), Internal) shouldBe Left("Invalid query syntax")
      }
    }
  }

  it("rejects a search query that failed parsing before validating other search parameters") {
    val params = SearchParams(
      tier = Internal,
      queryParseError = Some("Invalid query syntax")
    )

    SearchParams.validateQuerySyntax(params) shouldBe Left(List(InvalidUriParams("Invalid query syntax")))
    SearchParams.validate(params) shouldBe Left(List(InvalidUriParams("Invalid query syntax")))
  }

  it("retains search parse failures from the request so malformed deleted queries can be rejected") {
    val rawRequest = FakeRequest("GET", "/images?q=is%3Adeleted%09").withBody[Any](AnyContentAsEmpty)
    val request = new Security.AuthenticatedRequest[Any, Principal](
      UserPrincipal("Test", "User", "test@example.test"),
      rawRequest
    )
    val params = SearchParams(request)

    params.queryParseError shouldBe Some("Invalid query syntax")
    SearchParams.validate(params) shouldBe Left(List(InvalidUriParams("Invalid query syntax")))
  }

  it("retains aggregate parse failures from the request") {
    val request = FakeRequest("GET", "/images/aggregations?q=cats%09dogs")
    val params = AggregateSearchParams("keywords", request)

    params.queryParseError shouldBe Some("Invalid query syntax")
    AggregateSearchParams.validate(params) shouldBe Left(InvalidUriParams("Invalid query syntax"))
  }
}
