package com.gu.mediaservice.picdarexport.lib.picdar

import java.net.URI

import com.gu.mediaservice.picdarexport.lib.HttpClient
import com.gu.mediaservice.picdarexport.model.{Asset, DateRange}
import org.joda.time.DateTime
import org.joda.time.format.{DateTimeFormat, ISODateTimeFormat}
import play.api.Logger
import play.api.libs.ws.WSResponse

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global
import scala.xml.Node

import scala.language.postfixOps

trait PicdarApi extends HttpClient with PicdarInterface {

  val picdarUrl: String
  val picdarUsername: String
  val picdarPassword: String

  private def post(body: Node): Future[WSResponse] = {
    WS.url(picdarUrl).post(body)
  }

  case class SearchInstance(id: Int, count: Int)
  case class AssetRef(urn: String)


  lazy val currentMak: Future[Mak] = {
    Logger.debug("getting picdar MAK code")
    for {
      response <- post(messages.login(picdarUsername, picdarPassword))
      mak       = response.xml \ "ResponseData" \ "MAK" text
    } yield mak
  }


  def search(mak: Mak, dateField: String, dateRange: DateRange, urn: Option[String] = None): Future[SearchInstance] = {
    Logger.debug(s"searching media mogul for assets $dateField on $dateRange")
    for {
      response    <- post(messages.search(mak, dateField, dateRange, urn))
      responseData = response.xml \ "ResponseData"
      resultCount  = (responseData \ "MatchCount" text).toInt
      searchId     = (responseData \ "SearchID" text).toInt
    } yield SearchInstance(searchId, resultCount)
  }


  def closeSearch(mak: Mak, searchInstance: SearchInstance): Future[WSResponse] = {
    Logger.debug(s"closing search $searchInstance")
    post(messages.closeSearch(mak, searchInstance.id))
  }


  def fetchResults(mak: Mak, searchInstance: SearchInstance, range: Option[Range]): Future[Seq[AssetRef]] = {
    Logger.debug("fetching results")
    val start = range.map(_.start) getOrElse 0
    val length = range.map(_.length) getOrElse searchInstance.count
    // FIXME: off by 1, do we get all?
    val firstIndex = start + 1
    val lastIndex = math.min(start + length, searchInstance.count)
    val searchItemsFuture = for {
      response   <- post(messages.retrieveResults(mak, searchInstance.id, firstIndex, lastIndex))
      searchItems = response.xml \ "ResponseData" \ "Match"
    } yield searchItems

    searchItemsFuture map { searchItems =>
      for {
        matchNode  <- searchItems
        urn         = matchNode \ "MMRef" text
      } yield AssetRef(urn)
    }
  }

  // No timezone lol
  val picdarEsotericDateFormat = DateTimeFormat.forPattern("yyyyMMddHH:mm:ss")

  // Picdar field -> Media metadata key mapping
  // FIXME: Job_Description? Keywords  File_Name? Location Warnings Warning_Info
  // FIXME: People Picture_Attributes Temporary_Notes Copyright_Group (opt? eg Agencies - contract)
  // FIXME: or use case class?
  val picdarFieldMap = Map(
    "Headline"      -> "title",
    "Copyright"     -> "copyright",
    "Caption"       -> "description",
    "Photographer"  -> "byline",
    "Provider"      -> "credit",
    "Source"        -> "source",
    "Reference no." -> "suppliersReference"
  )

  def fetchAsset(mak: String, urn: String): Future[Asset] = {
    post(messages.retrieveAsset(mak, urn)) map { response =>
      println(response.xml)
      val record = (response.xml \ "ResponseData" \ "Record")(0)
      val assetFile = (record \ "VURL") find (v => (v \ "@type" text) == "original") map (_.text) map URI.create
      val createdOn = extractField(record, "Created on")
      val createdAt = extractField(record, "Created at")
      val created = (createdOn, createdAt) match {
        case (Some(on), Some(at)) => Some(DateTime.parse(s"$on$at", picdarEsotericDateFormat))
        case _ => None
      }

      val modified = extractField(record, "Modified on") map ISODateTimeFormat.basicDate().parseDateTime
      val infoUri = extractField(record, "InfoURL") map URI.create
      val metadata = for {
        (fieldName, metadataKey) <- picdarFieldMap
        value                    <- extractField(record, fieldName)
      } yield metadataKey -> value

      // Notes: Date Loaded seems to be the same as Created on, it's not when the image was loaded into the Library...

      // FIXME: error if get fails
      Asset(urn, assetFile get, created get, modified, metadata, infoUri)
    }
  }



  private def extractField(record: Node, name: String): Option[String] =
    (record \ "Field") find (v => (v \ "@name" text) == name) map (_.text.trim) filterNot (_.isEmpty)

}
