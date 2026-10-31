package lib

import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import com.gu.mediaservice.lib.config.FieldAlias
import play.api.libs.json.{JsArray, JsObject, Json}

class KupuaPageTest extends AnyFreeSpec with Matchers {
  "shouldServe" - {
    "serves Kupua only when opted in, outside iframes, on DEV or TEST" in {
      KupuaPage.shouldServe("TEST", switchOn = true, isIFramed = false) shouldBe true
      KupuaPage.shouldServe("DEV", switchOn = true, isIFramed = false) shouldBe true
    }

    "keeps Kahuna by default, inside iframes and on other stages" in {
      KupuaPage.shouldServe("TEST", switchOn = false, isIFramed = false) shouldBe false
      KupuaPage.shouldServe("TEST", switchOn = true, isIFramed = true) shouldBe false
      KupuaPage.shouldServe("PROD", switchOn = true, isIFramed = false) shouldBe false
      KupuaPage.shouldServe("CODE", switchOn = true, isIFramed = false) shouldBe false
    }
  }

  "render" - {
    val page = """<!doctype html><html><head><script type="module" src="/assets/kupua/assets/index.js"></script></head><body><div id="root"></div></body></html>"""

    "injects the config before Kupua's module script" in {
      val rendered = KupuaPage.render(page, Json.obj("mediaApiUri" -> "https://api.media.example.test")).get
      rendered should include("""<head><script>window.__KUPUA_CONFIG__={"mediaApiUri":"https://api.media.example.test"};</script><script type="module"""")
    }

    "escapes values so they cannot close the script element" in {
      val rendered = KupuaPage.render(page, Json.obj("x" -> "</script><img src=x>")).get
      rendered should not include "</script><img"
      rendered should include("\\u003c/script>\\u003cimg src=x>")
    }

    "reports a page without <head> as unavailable" in {
      KupuaPage.render("<html><body></body></html>", Json.obj()) shouldBe None
    }
  }

  "contentSecurityPolicy" - {
    val kahunaPolicy = "frame-src https://auth.example; connect-src 'self' https://api.example; default-src 'unsafe-inline' 'self'; script-src 'self' 'unsafe-inline' https://pinboard.example "

    "adds WebAssembly compilation to script-src only, leaving every other directive unchanged" in {
      KupuaPage.contentSecurityPolicy(kahunaPolicy) shouldBe
        "frame-src https://auth.example; connect-src 'self' https://api.example; default-src 'unsafe-inline' 'self'; script-src 'self' 'unsafe-inline' https://pinboard.example 'wasm-unsafe-eval'"
    }

    "never grants JavaScript eval and does not duplicate the token" in {
      val once = KupuaPage.contentSecurityPolicy(kahunaPolicy)
      KupuaPage.contentSecurityPolicy(once) shouldBe once
      once should not include "'unsafe-eval'"
    }

    "leaves a policy without script-src unchanged" in {
      KupuaPage.contentSecurityPolicy("default-src 'self'") shouldBe "default-src 'self'"
    }
  }

  "pageConfig" - {
    val alias = FieldAlias("fileMetadata.xmp.x:hidden", "Hidden", displayInAdditionalMetadata = false,
      displaySearchHint = false, "hiddenThing", List("a"), matchViaExistence = true)
    val settings = KupuaSiteSettings(
      staffPhotographerOrganisation = "ACME",
      shouldDisplayOrgOwnedCountAndFilterCheckbox = true,
      fieldAliases = Seq(alias),
      imageTypes = Seq("Handout"),
      recordDownloadAsUsage = true,
      useReaper = true,
      agencyPicksIngredients = Some(Map("metadata.keywords" -> Seq("pick"))),
      agencyPicksColour = "#123456",
      showDenySyndicationWarning = true,
      denySyndicationTextHeader = "Denied </script>",
      defaultShouldBlurGraphicImages = false
    )
    def config(s: KupuaSiteSettings = settings, showPaid: Option[Boolean] = Some(false)) =
      KupuaPage.pageConfig("https://api.example.test", "https://collections.example.test", s, showPaid)

    "keeps the service addresses and adds the user's paid-image permission" in {
      val json = config()
      (json \ "mediaApiUri").as[String] shouldBe "https://api.example.test"
      (json \ "collectionsUri").as[String] shouldBe "https://collections.example.test"
      (json \ "showPaid").as[Boolean] shouldBe false
      (config(showPaid = Some(true)) \ "showPaid").as[Boolean] shouldBe true
    }

    "omits showPaid when the permission is unknown rather than inventing a grant" in {
      config(showPaid = None).keys should not contain "showPaid"
    }

    "carries only the allowlisted site settings, aliases via Grid's serializer" in {
      val grid = (config() \ "gridConfig").as[JsObject]
      grid.keys shouldBe Set(
        "staffPhotographerOrganisation", "fieldAliases", "imageTypes", "recordDownloadAsUsage", "useReaper",
        "hasAgencyPicks", "agencyPicksIngredients", "agencyPicksColour", "tickerDefinitions",
        "showDenySyndicationWarning", "denySyndicationTextHeader", "defaultShouldBlurGraphicImages")
      (grid \ "staffPhotographerOrganisation").as[String] shouldBe "ACME"
      (grid \ "fieldAliases") .as[JsArray] shouldBe Json.arr(Json.toJson(alias))
      (grid \ "fieldAliases" \ 0 \ "matchViaExistence").as[Boolean] shouldBe true
      (grid \ "imageTypes").as[Seq[String]] shouldBe Seq("Handout")
      (grid \ "recordDownloadAsUsage").as[Boolean] shouldBe true
      (grid \ "useReaper").as[Boolean] shouldBe true
      (grid \ "hasAgencyPicks").as[Boolean] shouldBe true
      (grid \ "agencyPicksIngredients").as[Map[String, Seq[String]]] shouldBe Map("metadata.keywords" -> Seq("pick"))
      (grid \ "agencyPicksColour").as[String] shouldBe "#123456"
      (grid \ "showDenySyndicationWarning").as[Boolean] shouldBe true
      (grid \ "denySyndicationTextHeader").as[String] shouldBe "Denied </script>"
      (grid \ "defaultShouldBlurGraphicImages").as[Boolean] shouldBe false
    }

    "builds media-api's ticker shapes in its order" in {
      (config() \ "gridConfig" \ "tickerDefinitions").as[JsArray] shouldBe Json.arr(
        Json.obj("name" -> "ACME-owned", "searchClause" -> "is:ACME-owned", "backgroundColour" -> "#005689"),
        Json.obj("name" -> "agency picks", "searchClause" -> "is:agency-pick", "backgroundColour" -> "#123456",
          "subAggField" -> "usageRights.supplier")
      )
    }

    "encodes disabled features explicitly" in {
      val grid = (config(settings.copy(
        shouldDisplayOrgOwnedCountAndFilterCheckbox = false, agencyPicksIngredients = None,
        fieldAliases = Nil, imageTypes = Nil, useReaper = false
      )) \ "gridConfig").as[JsObject]
      (grid \ "tickerDefinitions").as[JsArray] shouldBe Json.arr()
      (grid \ "hasAgencyPicks").as[Boolean] shouldBe false
      (grid \ "agencyPicksIngredients").as[JsObject] shouldBe Json.obj()
      (grid \ "fieldAliases").as[JsArray] shouldBe Json.arr()
      (grid \ "imageTypes").as[JsArray] shouldBe Json.arr()
      (grid \ "useReaper").as[Boolean] shouldBe false
    }

    "renders safely inside the page" in {
      val rendered = KupuaPage.render("<html><head></head></html>", config()).get
      rendered should not include "Denied </script>"
    }
  }

  "the switch cookie matches Kahuna's feature-switch convention" in {
    KupuaPage.SwitchCookie shouldBe "feature-switch-use-kupua"
  }
}
