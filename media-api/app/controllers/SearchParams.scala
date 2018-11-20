package controllers

import com.gu.mediaservice.lib.auth.Tier
import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.formatting.{parseDateFromQuery, printDateTime}
import com.gu.mediaservice.model.SyndicationStatus
import com.gu.mediaservice.model.usage.UsageStatus
import lib.querysyntax.{Condition, Parser}
import org.joda.time.DateTime
import scalaz.syntax.applicative._
import scalaz.syntax.std.list._
import scalaz.syntax.validation._
import scalaz.{Validation, ValidationNel}

import scala.util.Try

case class SearchParams(
  query: Option[String] = None,
  structuredQuery: List[Condition] = List.empty,
  ids: Option[List[String]] = None,
  offset: Int = 0,
  length: Int = 10,
  orderBy: Option[String] = None,
  since: Option[DateTime] = None,
  until: Option[DateTime] = None,
  modifiedSince: Option[DateTime] = None,
  modifiedUntil: Option[DateTime] = None,
  takenSince: Option[DateTime] = None,
  takenUntil: Option[DateTime] = None,
  archived: Option[Boolean] = None,
  hasExports: Option[Boolean] = None,
  hasIdentifier: Option[String] = None,
  missingIdentifier: Option[String] = None,
  valid: Option[Boolean] = None,
  free: Option[Boolean] = None,
  payType: Option[PayType.Value] = None,
  hasRightsCategory: Option[Boolean] = None,
  uploadedBy: Option[String] = None,
  labels: List[String] = List.empty,
  hasMetadata: List[String] = List.empty,
  persisted: Option[Boolean] = None,
  usageStatus: List[UsageStatus] = List.empty,
  usagePlatform: List[String] = List.empty,
  tier: Tier,
  syndicationStatus: Option[SyndicationStatus] = None
)

case class InvalidUriParams(message: String) extends Throwable
object InvalidUriParams {
  val errorKey = "invalid-uri-parameters"
}

object PayType extends Enumeration {
  type PayType = Value
  val Free = Value("free")
  val MaybeFree = Value("maybe-free")
  val All = Value("all")
  val Pay = Value("pay")

  def create(s: String) = s match {
    case "free" => Some(Free)
    case "maybe-free" => Some(MaybeFree)
    case "all" => Some(All)
    case "pay" => Some(Pay)
    case _ => None
  }
}

object SearchParams {
  def commasToList(s: String): List[String] = s.trim.split(',').toList
  def listToCommas(list: List[String]): Option[String] = list.toNel.map(_.list.mkString(","))

  // TODO: return descriptive 400 error if invalid
  def parseIntFromQuery(s: String): Option[Int] = Try(s.toInt).toOption
  def parsePayTypeFromQuery(s: String): Option[PayType.Value] = PayType.create(s)
  def parseBooleanFromQuery(s: String): Option[Boolean] = Try(s.toBoolean).toOption
  def parseSyndicationStatus(s: String): Option[SyndicationStatus] = Some(SyndicationStatus(s))

  def apply(request: Authentication.Request[Any]): SearchParams = {

    def commaSep(key: String): List[String] = request.getQueryString(key).toList.flatMap(commasToList)

    val query = request.getQueryString("q")
    val structuredQuery = query.map(Parser.run) getOrElse List()

    SearchParams(
      query,
      structuredQuery,
      request.getQueryString("ids").map(_.split(",").toList),
      request.getQueryString("offset") flatMap parseIntFromQuery getOrElse 0,
      request.getQueryString("length") flatMap parseIntFromQuery getOrElse 10,
      request.getQueryString("orderBy"),
      request.getQueryString("since") flatMap parseDateFromQuery,
      request.getQueryString("until") flatMap parseDateFromQuery,
      request.getQueryString("modifiedSince") flatMap parseDateFromQuery,
      request.getQueryString("modifiedUntil") flatMap parseDateFromQuery,
      request.getQueryString("takenSince") flatMap parseDateFromQuery,
      request.getQueryString("takenUntil") flatMap parseDateFromQuery,
      request.getQueryString("archived") flatMap parseBooleanFromQuery,
      request.getQueryString("hasExports") flatMap parseBooleanFromQuery,
      request.getQueryString("hasIdentifier"),
      request.getQueryString("missingIdentifier"),
      request.getQueryString("valid") flatMap parseBooleanFromQuery,
      request.getQueryString("free") flatMap parseBooleanFromQuery,
      request.getQueryString("payType") flatMap parsePayTypeFromQuery,
      request.getQueryString("hasRightsCategory") flatMap parseBooleanFromQuery,
      request.getQueryString("uploadedBy"),
      commaSep("labels"),
      commaSep("hasMetadata"),
      request.getQueryString("persisted") flatMap parseBooleanFromQuery,
      commaSep("usageStatus").map(UsageStatus(_)),
      commaSep("usagePlatform"),
      request.user.apiKey.tier,
      request.getQueryString("syndicationStatus") flatMap parseSyndicationStatus
    )
  }


  def toStringMap(searchParams: SearchParams): Map[String, String] =
    Map(
      "q"                 -> searchParams.query,
      "ids"               -> searchParams.ids.map(_.mkString(",")),
      "offset"            -> Some(searchParams.offset.toString),
      "length"            -> Some(searchParams.length.toString),
      "since"             -> searchParams.since.map(printDateTime),
      "until"             -> searchParams.until.map(printDateTime),
      "modifiedSince"     -> searchParams.modifiedSince.map(printDateTime),
      "modifiedUntil"     -> searchParams.modifiedUntil.map(printDateTime),
      "takenSince"        -> searchParams.takenSince.map(printDateTime),
      "takenUntil"        -> searchParams.takenUntil.map(printDateTime),
      "archived"          -> searchParams.archived.map(_.toString),
      "hasExports"        -> searchParams.hasExports.map(_.toString),
      "hasIdentifier"     -> searchParams.hasIdentifier,
      "missingIdentifier" -> searchParams.missingIdentifier,
      "valid"             -> searchParams.valid.map(_.toString),
      "free"              -> searchParams.free.map(_.toString),
      "payType"           -> searchParams.payType.map(_.toString),
      "uploadedBy"        -> searchParams.uploadedBy,
      "labels"            -> listToCommas(searchParams.labels),
      "hasMetadata"       -> listToCommas(searchParams.hasMetadata),
      "persisted"         -> searchParams.persisted.map(_.toString),
      "usageStatus"       -> listToCommas(searchParams.usageStatus.map(_.toString)),
      "usagePlatform"     -> listToCommas(searchParams.usagePlatform)
    ).foldLeft(Map[String, String]()) {
      case (acc, (key, Some(value))) => acc + (key -> value)
      case (acc, (_,   None))        => acc
    }

  type SearchParamValidation = Validation[InvalidUriParams, SearchParams]
  type SearchParamValidations = ValidationNel[InvalidUriParams, SearchParams]
  val maxSize = 200

  def validate(searchParams: SearchParams): SearchParamValidations = {
    // we just need to return the first `searchParams` as we don't need to manipulate them
    // TODO: try reduce these
    (validateLength(searchParams).toValidationNel |@| validateOffset(searchParams).toValidationNel)((s1, s2) => s1)
  }

  def validateOffset(searchParams: SearchParams): SearchParamValidation = {
    if (searchParams.offset < 0) InvalidUriParams("offset cannot be less than 0").failure else searchParams.success
  }

  def validateLength(searchParams: SearchParams): SearchParamValidation = {
    if (searchParams.length > maxSize) InvalidUriParams(s"length cannot exceed $maxSize").failure else searchParams.success
  }

}
