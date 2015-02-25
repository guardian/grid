package com.gu.mediaservice.picdarexport.lib.picdar

import java.net.{SocketTimeoutException, URI}

import com.gu.mediaservice.picdarexport.lib.HttpClient
import com.gu.mediaservice.picdarexport.model.{AssetRef, Asset, DateRange}

import scala.concurrent.Future
import com.gu.mediaservice.picdarexport.lib.ExecutionContexts

case class PicdarAssetReadError(message: String) extends Exception(message)

trait PicdarClient extends PicdarApi with HttpClient {

  // Use picdar pool for all operations by default
  import ExecutionContexts.picdar

  def getAssetData(assetUri: URI): Future[Array[Byte]] =
    readBytes(assetUri)(ExecutionContexts.picdarAsset) recoverWith {
      case ex: SocketTimeoutException => Future.failed(PicdarAssetReadError(ex.getMessage))
    }

  def get(urn: String): Future[Asset] =
    for {
      mak   <- currentMak
      asset <- fetchAsset(mak, urn)
    } yield asset

  def count(dateField: String, dateRange: DateRange): Future[Int] =
    for {
      mak            <- currentMak
      searchInstance <- search(mak, dateField, dateRange)
      _              <- closeSearch(mak, searchInstance)
    } yield searchInstance.count

  def query(dateField: String, dateRange: DateRange, queryRange: Option[Range]): Future[Seq[AssetRef]] = {
    for {
      mak            <- currentMak
      searchInstance <- search(mak, dateField, dateRange)
      results        <- fetchResults(mak, searchInstance, queryRange)
      _              <- closeSearch(mak, searchInstance)
    } yield results
  }

  def queryAssets(dateField: String, dateRange: DateRange, queryRange: Option[Range]): Future[Seq[Asset]] = {
    for {
      mak            <- currentMak
      searchInstance <- search(mak, dateField, dateRange)
      results        <- fetchResults(mak, searchInstance, queryRange)
      assets         <- Future.sequence(results.map(_.urn).map(urn => fetchAsset(mak, urn)))
      _              <- closeSearch(mak, searchInstance)
    } yield assets
  }
}
