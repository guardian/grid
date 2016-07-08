package com.gu.mediaservice.picdarexport.lib.picdar

import java.net.URI

import com.gu.mediaservice.lib.config.{MetadataConfig, PhotographersList}
import com.gu.mediaservice.model._
import com.gu.mediaservice.picdarexport.lib.cleanup.UsageRightsOverride
import com.gu.mediaservice.picdarexport.lib.{Config, LogHelper, HttpClient}
import com.gu.mediaservice.picdarexport.model.{PicdarDates, AssetRef, Asset, DateRange}
import org.joda.time.DateTime
import org.joda.time.format.{DateTimeFormat, ISODateTimeFormat}
import play.api.Logger

import scala.concurrent.Future
import com.gu.mediaservice.picdarexport.lib.ExecutionContexts.picdar
import scala.xml.{XML, Elem, Node}

import scala.language.postfixOps

import scalaj.http._

case class PicdarError(message: String) extends RuntimeException(message)

trait PicdarApi extends HttpClient with PicdarInterface with LogHelper {

  val picdarUrl: String
  val picdarUsername: String
  val picdarPassword: String

  import Config.{picdarApiConnTimeout, picdarApiReadTimeout}

  private def post(body: Node): Future[Elem] = Future { logDuration("PicdarApi.post") {

    println(picdarUrl)
    println(body)

    val respBody = Http(picdarUrl).
      header("Content-Type", "text/xml").
      // Patience is the mother of all virtues
      timeout(picdarApiConnTimeout, picdarApiReadTimeout).
      postData(body.toString()).
      asString.
      body

    XML.loadString(respBody)
  } }

  case class SearchInstance(id: Int, count: Int)


  lazy val currentMak: Future[Mak] = {
    Logger.debug("getting picdar MAK code")
    for {
      response <- post(messages.login(picdarUsername, picdarPassword))
      mak       = response \ "ResponseData" \ "MAK" text
    } yield mak
  }

  def search(mak: Mak, dateField: String, dateRange: DateRange, urn: Option[String] = None, query: Option[String] = None): Future[SearchInstance] = {
    def failIfErrorResponse(responseNode: Node): Future[Unit] = {
      extractAttribute(responseNode, "result") match {
        case Some("OK") => Future.successful(())
        case _          => Future.failed(PicdarError(responseNode.text))
      }
    }

    Logger.debug(s"searching media mogul for assets $dateField on $dateRange")
    for {
      response    <- post(messages.search(mak, dateField, dateRange, urn, query))
      _           <- failIfErrorResponse((response \ "Response") head) // Let's pray that it's there
      responseData = response \ "ResponseData"
      resultCount  = (responseData \ "MatchCount" text).toInt
      searchId     = (responseData \ "SearchID" text).toInt
      _            = Logger.debug(s"search results: $resultCount matches, search id $searchId")
    } yield SearchInstance(searchId, resultCount)
  }


  def closeSearch(mak: Mak, searchInstance: SearchInstance): Future[Elem] = {
    Logger.debug(s"closing search $searchInstance")
    post(messages.closeSearch(mak, searchInstance.id))
  }


  // No timezone lol
  val picdarAmericanDateFormat = DateTimeFormat.forPattern("yyyyMMdd")

  def fetchResults(mak: Mak, searchInstance: SearchInstance, range: Option[Range]): Future[Seq[AssetRef]] = {
    Logger.debug("fetching results")
    val start = range.map(_.start) getOrElse 0
    val length = range.map(_.length) getOrElse searchInstance.count
    // FIXME: off by 1, do we get all?
    val firstIndex = start + 1
    val lastIndex = math.min(start + length, searchInstance.count)
    val searchItemsFuture = for {
      response   <- post(messages.retrieveResults(mak, searchInstance.id, firstIndex, lastIndex))
      searchItems = response \ "ResponseData" \ "Record"
    } yield searchItems

    searchItemsFuture map { searchItems =>
      for {
        matchNode  <- searchItems
        urn         = (matchNode \ "MMRef" text)
        _ = println(matchNode)
        dateString <- extractField(matchNode, "Date Loaded")

        // Where we're going Marty - we don't need accurate dates
        dateLoaded  = picdarAmericanDateFormat.parseDateTime("19551105")
      } yield AssetRef(urn, dateLoaded)
    }
  }

  // No timezone lol
  val picdarEsotericDateFormat = PicdarDates.longFormat

  import scala.util.Try

  def fetchAsset(mak: String, urn: String): Future[Asset] = {
    post(messages.retrieveAsset(mak, urn)) flatMap { response =>
      Try {
        val record = (response \ "ResponseData" \ "Record")(0)
        //val assetFileOpt = (record \ "VURL") find (v => (v \ "@type" text) == "original") map (_.text) map URI.create
        val assetFileOpt = Some(URI.create(s"http://localhost:3000/images/${urn}.jpg"))

        val createdOn = extractField(record, "Created on")
        val createdAt = extractField(record, "Created at")
        val created = (createdOn, createdAt) match {
          case (Some(on), Some(at)) => Some(DateTime.parse(s"$on$at", picdarEsotericDateFormat))
          case _ => None
        }

        val modified = extractField(record, "Modified on") map ISODateTimeFormat.basicDate().parseDateTime
        val infoUri = extractField(record, "InfoURL") map URI.create

        // Picdar field -> Media metadata key mapping
        // FIXME: Job_Description? Keywords  File_Name? Location Warnings Warning_Info
        // FIXME: People "Picture Attributes", "Temporary Notes"
        val metadata = ImageMetadata(
          dateTaken           = None,
          description         = extractField(record, "Caption"),
          credit              = extractField(record, "Provider"),
          byline              = extractField(record, "Photographer"),
          bylineTitle         = None,
          title               = extractField(record, "Headline"),
          copyrightNotice     = None,
          copyright           = extractField(record, "Copyright"),
          suppliersReference  = extractField(record, "Reference no."),
          source              = extractField(record, "Source"),
          specialInstructions = None,
          keywords            = List(),
          subLocation         = None,
          city                = None,
          state               = None,
          country             = None
        )

        val usageRights = extractField(record, "Copyright Group") flatMap (UsageRightsOverride.getUsageRights(_, metadata))

        // Notes: Date Loaded seems to be the same as Created on, it's not when the image was loaded into the Library...

        // Sometimes there is no assetFile at all! lol
        assetFileOpt map { assetFile =>
          Future.successful(Asset(urn, assetFile, created get, modified, metadata, infoUri, usageRights))
          } getOrElse {
            Future.failed(PicdarError(s"No asset file for $urn"))
          }
      }.getOrElse(Future.failed(PicdarError(s"Failed to extract useful rights data for $urn")))
    }
  }

  private def extractField(record: Node, name: String): Option[String] =
    (record \ "Field") find (v => (v \ "@name" text) == name) map (_.text.trim) filterNot (_.isEmpty)

  private def extractAttribute(node: Node, attrName: String): Option[String] =
    node.attribute(attrName) flatMap (_.headOption) map (_.text.trim) filterNot (_.isEmpty)

}
