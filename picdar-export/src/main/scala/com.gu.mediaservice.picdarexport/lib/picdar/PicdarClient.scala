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

// Note: legacy implementation that batch-requested larger ranges to be more efficient
//  val ingestionBatchSize = 20
//
//  def ingestOLD(system: String, dateField: String, dateRange: DateRange, queryRange: QueryRange) = doSearch(dateField: String, dateRange: DateRange) { (mak, searchInstance) =>
//    println(s"${searchInstance.count} matches to ingest")
//
//    def ingest0(range: Range): Future[List[Option[URI]]] = {
//      println(s"ingest range $range")
//
//      for {
//        results        <- fetchResults(mak, searchInstance, range)
//        _               = println(results)
//        // FIXME: we wait for all assets to be fetched, could pipe into upload directly (traverse?)
//        assets         <- Future.sequence(results.map(_.urn).map(urn => fetchAsset(mak, urn)))
//        uploadedIds    <- Future.sequence(assets map uploadAsset)
//        _               = println(s"Uploaded $uploadedIds")
//      } yield uploadedIds
//    }
//
//    val start = queryRange.start
//    val end = queryRange.end.map(List(_, searchInstance.count).min) getOrElse searchInstance.count
//    val ranges = (start to end by ingestionBatchSize) map (n => Range(n, ingestionBatchSize))
//    // FIXME: might miss the last few past the last range! or ingest too many?
//    val all = ranges.foldLeft(Future.successful(List[Option[URI]]())) { (f, range) =>
//      f.flatMap( results => ingest0(range).map( results ++ _ ) )
//    }
//    all.onSuccess { case ids =>
//      val successes = ids.filter(_.isDefined)
//      val failures = ids.filter(_.isEmpty)
//      println(s"Uploaded ${ids.size} assets (${successes.size} successful, ${failures.size} failed)")
//    }
//    all
//  }
//
//  def doSearch[T](dateField: String, dateRange: DateRange)(handler: (Mak, SearchInstance) => Future[T]) = currentMak map { mak =>
//    for {
//      searchInstance <- search(mak, dateField, dateRange)
//      res            <- handler(mak, searchInstance)
//      _              <- closeSearch(mak, searchInstance)
//    } yield res
//  }
