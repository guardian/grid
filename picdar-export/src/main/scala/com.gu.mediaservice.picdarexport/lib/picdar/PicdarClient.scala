package com.gu.mediaservice.picdarexport.lib.picdar

import com.gu.mediaservice.picdarexport.lib.HttpClient
import com.gu.mediaservice.picdarexport.model.{Asset, DateRange}

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global

trait PicdarClient extends PicdarApi with HttpClient {

  def readAssetFile(asset: Asset): Future[Array[Byte]] = readBytes(asset.file)

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

  def query(dateField: String, dateRange: DateRange, queryRange: Option[Range]): Future[Seq[Asset]] = {
    for {
      mak            <- currentMak
      searchInstance <- search(mak, dateField, dateRange)
      results        <- fetchResults(mak, searchInstance, queryRange)
      _               = println(s"${results.size} results")
      assets         <- Future.sequence(results.map(_.urn).map(urn => fetchAsset(mak, urn)))
      _               = println(s"Retrieve $assets")
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
