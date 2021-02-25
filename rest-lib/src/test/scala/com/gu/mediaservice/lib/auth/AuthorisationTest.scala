package com.gu.mediaservice.lib.auth

import com.gu.mediaservice.lib.auth.Authentication.{MachinePrincipal, Request, UserPrincipal}
import com.gu.mediaservice.lib.auth.Permissions.{Test, VisibilityFilter}
import com.gu.mediaservice.lib.auth.provider.AuthorisationProvider
import org.scalamock.scalatest.AsyncMockFactory
import org.scalatest.{AsyncFreeSpec, BeforeAndAfterAll, EitherValues, Matchers}
import play.api.mvc.{AnyContent, Result, Results, Security}

import scala.concurrent.Future

class AuthorisationTest extends AsyncFreeSpec with Matchers with EitherValues with BeforeAndAfterAll with AsyncMockFactory {
  private val dave = UserPrincipal("Dave", "Bowman", "dave")
  private val internalMachine = MachinePrincipal(ApiAccessor("hal", Internal))
  private val roMachine = MachinePrincipal(ApiAccessor("machine", ReadOnly))
  private val syndicationMachine = MachinePrincipal(ApiAccessor("machine", Syndication))
  private val editMetadataContext = PermissionContext(Permissions.EditMetadata)

  "hasPermissionTo (context)" - {
    "delegates to provider when a user principal" in {
      val mockProvider = mock[AuthorisationProvider]
      (mockProvider.hasPermissionTo[Unit] _).expects(editMetadataContext, dave).returning(true).once()
      val auth = new Authorisation(mockProvider, executionContext)
      val filter = auth.hasPermissionTo(editMetadataContext)
      filter(dave) shouldBe true
    }
    "shortcuts when a machine principal is presented with an internal tier" - {
      val mockProvider = mock[AuthorisationProvider]
      val auth = new Authorisation(mockProvider, executionContext)
      "internal should always be allowed" in {
        (mockProvider.hasPermissionTo[Unit] _).expects(editMetadataContext, *).returns(true).never()
        val filter = auth.hasPermissionTo(editMetadataContext)
        filter(internalMachine) shouldBe true
      }
      "others should be delegated to the provider" in {
        (mockProvider.hasPermissionTo[Unit] _).expects(editMetadataContext, *).returns(false).twice()
        val filter = auth.hasPermissionTo(editMetadataContext)
        filter(roMachine) shouldBe false
        filter(syndicationMachine) shouldBe false
      }
    }
  }
  "visibilityFilterFor (permission, principal)" - {
    "delegates to provider" in {
      val visibilityFilter: VisibilityFilter[String] = { _:String => false }
      val mockProvider = mock[AuthorisationProvider]
      (mockProvider.visibilityFilterFor[String] _).expects(Test, dave).returns(visibilityFilter).once()
      val auth = new Authorisation(mockProvider, executionContext)
      val filter = auth.visibilityFilterFor(Test, dave)
      filter("anything") shouldBe false
    }
    "shortcuts when machine principal with internal tier" in {
      val mockProvider = mock[AuthorisationProvider]
      (mockProvider.visibilityFilterFor[String] _).expects(*, *).never()
      val auth = new Authorisation(mockProvider, executionContext)
      val filter = auth.visibilityFilterFor(Test, internalMachine)
      filter("anything") shouldBe true
    }
    "delegates when machine principal is not internal tier" in {
      val visibilityFilter: VisibilityFilter[String] = { _:String => false }
      val mockProvider = mock[AuthorisationProvider]
      (mockProvider.visibilityFilterFor[String] _).expects(Test, *).returns(visibilityFilter).twice()
      val auth = new Authorisation(mockProvider, executionContext)
      val roFilter = auth.visibilityFilterFor(Test, roMachine)
      val synFilter = auth.visibilityFilterFor(Test, syndicationMachine)
      roFilter("anything") shouldBe false
      synFilter("anything") shouldBe false
    }
  }
  "actionFilterFor" - {
    val badResult = Results.Unauthorized("Sorry dave, I'm afraid I can't do that")
    val block: Request[AnyContent] => Future[Result] = _ => Future.successful(Results.Ok("OK"))

    "should delegate to provider and return result if allowed" in {
      val mockProvider = mock[AuthorisationProvider]
      (mockProvider.hasPermissionTo[Unit] _).expects(editMetadataContext, dave).returning(true).once()
      val auth = new Authorisation(mockProvider, executionContext)
      val filter = auth.actionFilterFor(editMetadataContext, badResult)
      val req: Request[AnyContent] = new Security.AuthenticatedRequest(dave, null)
      filter.invokeBlock(req, block).map { result =>
        result shouldBe Results.Ok("OK")
      }
    }

    "should delegate to provider and return badResult if not allowed" in {
      val mockProvider = mock[AuthorisationProvider]
      (mockProvider.hasPermissionTo[Unit] _).expects(editMetadataContext, dave).returning(false).once()
      val auth = new Authorisation(mockProvider, executionContext)
      val filter = auth.actionFilterFor(editMetadataContext, badResult)
      val req: Request[AnyContent] = new Security.AuthenticatedRequest(dave, null)
      filter.invokeBlock(req, block).map { result =>
        result shouldBe badResult
      }
    }
  }

}
