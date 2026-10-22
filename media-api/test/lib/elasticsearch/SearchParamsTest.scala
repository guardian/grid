package lib.elasticsearch

import com.gu.mediaservice.lib.auth.Authentication.{Principal, UserPrincipal}
import com.gu.mediaservice.lib.auth.Internal
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.mvc.{AnyContentAsEmpty, Security}
import play.api.test.FakeRequest

class SearchParamsTest extends AnyFunSpec with Matchers {

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
