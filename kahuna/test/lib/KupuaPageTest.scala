package lib

import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.Json

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

  "the switch cookie matches Kahuna's feature-switch convention" in {
    KupuaPage.SwitchCookie shouldBe "feature-switch-use-kupua"
  }
}
