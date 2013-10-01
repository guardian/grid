package com.gu.mediaservice

import java.net.URL
import scala.concurrent.{ExecutionContext, Future}
import scala.xml.Node
import org.joda.time.DateTime
import play.api.libs.ws.WS


case class PicdarImage(mmref: Picdar.MMRef, url: URL)

class Picdar(implicit ex: ExecutionContext) {

  import Picdar._

  def latestResults(n: Int = 10): Future[List[PicdarImage]] = {
    val start = DateTime.now
    val end = start.minusHours(6)
    for {
      mak  <- getAccessCode
      urls <- runSearch(mak, start, end) { id =>
        for {
          refs <- assetSearch(mak, id, 1, n + 1)
          imgs <- Future.traverse(refs)(assetDetails(mak, _))
        } yield imgs
      }
    } yield urls
  }

  def getAccessCode: Future[MAK] = {
    val request =
      <MogulAction>
        <ActionType>Login</ActionType>
        <ActionData>
          <UserName>{picdarUsername}</UserName>
          <Password>{picdarPassword}</Password>
        </ActionData>
      </MogulAction>

    for {
      response <- postXML(request)
    } yield (response \ "ResponseData" \ "MAK").text
  }

  def assetSearch(mak: MAK, searchId: SearchId, firstIndex: Int, lastIndex: Int): Future[List[MMRef]] = {
    val request =
      <MogulAction>
        <MAK>{mak}</MAK>
        <ActionType>RetrieveResults</ActionType>
        <ActionData>
          <SearchType>Asset</SearchType>
          <SearchID>{searchId}</SearchID>
          <FirstIndex>{firstIndex}</FirstIndex>
          <LastIndex>{lastIndex}</LastIndex>
        </ActionData>
      </MogulAction>

    for {
      response <- postXML(request)
      matches   = (response \ "ResponseData" \ "Match").toList
    } yield matches map (m => (m \ "MMRef").text)
  }

  def assetDetails(mak: MAK, mmref: MMRef): Future[PicdarImage] = {
    val request = <MogulAction>
      <MAK>{mak}</MAK>
      <ActionType>RetrieveAssetData</ActionType>
      <ActionData>
        <MMRef Table="photorecord">{mmref}</MMRef>
      </ActionData>
    </MogulAction>

    for {
      response <- postXML(request)
      item      = response \ "ResponseData" \ "Record"
      url       = (item \ "VURL").filter(u => (u \ "@type").text == "original").text
    } yield PicdarImage(mmref, new URL(url))
  }

  def runSearch[A](mak: MAK, startDate: DateTime, endDate: DateTime)(f: SearchId => Future[A]): Future[A] = {
    val request =
      <MogulAction>
        <MAK>{mak}</MAK>
        <ActionType>Search</ActionType>
        <ActionData>
          <ResultSets>Multiple</ResultSets>
          <SearchType>Asset</SearchType>
          <MMRef></MMRef>
          <SearchField name="date_created" type="daterange">
            <StartDate>{startDate.toString("yyyyMMdd")}</StartDate>
            <EndDate>{endDate.toString("yyyyMMdd")}</EndDate>
          </SearchField>
        </ActionData>
      </MogulAction>

    // TODO check response status
    for {
      response <- postXML(request)
      searchId  = (response \ "ResponseData" \ "SearchID").text.toInt
      a        <- onComplete(f(searchId))(closeSearch(mak, searchId))
    } yield a
  }

  /** An onComplete that allows chaining */
  def onComplete[A](f1: Future[A])(f2: => Future[Unit]): Future[A] = {
    f1.onComplete(_ => f2)
    f1
  }

  def closeSearch(mak: MAK, searchId: SearchId): Future[Unit] = {
    val request =
      <MogulAction>
        <MAK>{mak}</MAK>
        <ActionType>SearchClose</ActionType>
        <ActionData>
          <SearchType>Asset</SearchType>
          <SearchID>{searchId}</SearchID>
        </ActionData>
      </MogulAction>

    postXML(request) map (_ => ())
  }

  def postXML[T](body: Node): Future[Node] = WS.url(picdarUrl).post(body).map(_.xml)

}

object Picdar {

  type MAK = String
  type MMRef = String
  type SearchId = Int

  val picdarUsername = "guardian.co.uk"
  val picdarPassword = "pictures"
  val picdarUrl = "http://10.192.2.32:8079/cgi-bin/MogulServiceDesk"

}
