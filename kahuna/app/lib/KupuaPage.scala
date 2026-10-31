package lib

import com.gu.mediaservice.lib.config.FieldAlias
import play.api.libs.json.{JsObject, Json}

/** The allowlisted site settings Kupua receives; never raw configuration. */
case class KupuaSiteSettings(
  staffPhotographerOrganisation: String,
  shouldDisplayOrgOwnedCountAndFilterCheckbox: Boolean,
  fieldAliases: Seq[FieldAlias],
  imageTypes: Seq[String],
  recordDownloadAsUsage: Boolean,
  useReaper: Boolean,
  agencyPicksIngredients: Option[Map[String, Seq[String]]],
  agencyPicksColour: String,
  showDenySyndicationWarning: Boolean,
  denySyndicationTextHeader: String,
  defaultShouldBlurGraphicImages: Boolean
)

object KupuaSiteSettings {
  def from(config: KahunaConfig): KupuaSiteSettings = KupuaSiteSettings(
    staffPhotographerOrganisation = config.staffPhotographerOrganisation,
    shouldDisplayOrgOwnedCountAndFilterCheckbox = config.shouldDisplayOrgOwnedCountAndFilterCheckbox,
    fieldAliases = config.fieldAliasConfigs,
    imageTypes = config.imageTypes,
    recordDownloadAsUsage = config.recordDownloadAsUsage,
    useReaper = config.useReaper.getOrElse(false),
    agencyPicksIngredients = config.agencyPicksIngredients,
    agencyPicksColour = config.agencyPicksColour,
    showDenySyndicationWarning = config.showDenySyndicationWarning.getOrElse(false),
    denySyndicationTextHeader = config.denySyndicationTextHeader,
    defaultShouldBlurGraphicImages = config.defaultShouldBlurGraphicImages
  )
}

/**
 * Temporary experiment: Kahuna serves the Kupua prototype's page instead of its own
 * when the user opts in.
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

  /** `showPaid` is per-request: never cache the result across users. */
  def pageConfig(mediaApiUri: String, collectionsUri: String, settings: KupuaSiteSettings, showPaid: Option[Boolean]): JsObject = {
    import settings._
    // Mirrors media-api's ticker map in ElasticSearch.scala.
    val orgTicker =
      if (shouldDisplayOrgOwnedCountAndFilterCheckbox) Some(Json.obj(
        "name" -> s"$staffPhotographerOrganisation-owned",
        "searchClause" -> s"is:$staffPhotographerOrganisation-owned",
        "backgroundColour" -> "#005689"))
      else None
    val agencyTicker = agencyPicksIngredients.map(_ => Json.obj(
      "name" -> "agency picks",
      "searchClause" -> "is:agency-pick",
      "backgroundColour" -> agencyPicksColour,
      "subAggField" -> "usageRights.supplier"))
    val gridConfig = Json.obj(
      "staffPhotographerOrganisation" -> staffPhotographerOrganisation,
      "fieldAliases" -> fieldAliases,
      "imageTypes" -> imageTypes,
      "recordDownloadAsUsage" -> recordDownloadAsUsage,
      "useReaper" -> useReaper,
      "hasAgencyPicks" -> agencyPicksIngredients.isDefined,
      "agencyPicksIngredients" -> Json.toJson(agencyPicksIngredients.getOrElse(Map.empty[String, Seq[String]])),
      "agencyPicksColour" -> agencyPicksColour,
      "tickerDefinitions" -> (orgTicker.toList ++ agencyTicker.toList),
      "showDenySyndicationWarning" -> showDenySyndicationWarning,
      "denySyndicationTextHeader" -> denySyndicationTextHeader,
      "defaultShouldBlurGraphicImages" -> defaultShouldBlurGraphicImages
    )
    Json.obj("mediaApiUri" -> mediaApiUri, "collectionsUri" -> collectionsUri, "gridConfig" -> gridConfig) ++
      showPaid.fold(Json.obj())(paid => Json.obj("showPaid" -> paid))
  }

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
