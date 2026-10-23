package lib

import play.api.libs.json.{JsObject, Json}

/**
 * Temporary experiment: Kahuna serves the Kupua prototype's page instead of its own
 * when the user opts in. See kupua/exploration/docs/kupua-TEST-deployment-plan.md.
 */
object KupuaPage {
  val SwitchCookie: String = s"feature-switch-${UseKupua.key}"
  val IndexResource: String = "public/kupua/index.html"

  private val allowedStages = Set("DEV", "TEST")

  def isAllowedStage(stage: String): Boolean = allowedStages.contains(stage)

  /** Never inside iframes: embedding tools (e.g. Composer) use Kahuna as a picker. */
  def shouldServe(stage: String, switchOn: Boolean, isIFramed: Boolean): Boolean =
    isAllowedStage(stage) && switchOn && !isIFramed

  /**
   * Kahuna's policy plus 'wasm-unsafe-eval' in script-src, for Kupua's page only: its Justified
   * layout compiles WebAssembly. This permits WebAssembly compilation, not JavaScript eval.
   */
  def contentSecurityPolicy(kahunaPolicy: String): String =
    kahunaPolicy.split(";").map(_.trim).filter(_.nonEmpty).map { directive =>
      if (directive.split("\\s+").headOption.contains("script-src") && !directive.contains("'wasm-unsafe-eval'"))
        s"$directive 'wasm-unsafe-eval'"
      else directive
    }.mkString("; ")

  /** Kupua's built page with its runtime config injected first in <head>; None if it has no <head>. */
  def render(indexHtml: String, config: JsObject): Option[String] = {
    val headTag = "<head>"
    val at = indexHtml.indexOf(headTag)
    if (at < 0) None
    else {
      val json = Json.stringify(config).replace("<", "\\u003c")
      Some(indexHtml.patch(at + headTag.length, s"<script>window.__KUPUA_CONFIG__=$json;</script>", 0))
    }
  }
}
