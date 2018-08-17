package com.gu.thrall.clients.elasticsearchtests

import org.apache.http.entity.ContentType
import org.apache.http.nio.entity.NStringEntity
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.concurrent.ScalaFutures._
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{FreeSpec, Matchers}

import scala.io.Source

class ElasticSearchUnimplementedTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  def getRequestBody(name: String): NStringEntity =
    new NStringEntity(Source.fromResource(s"elasticSearchRequests/$name.request").getLines.mkString(""), ContentType.APPLICATION_JSON)

  implicit val patienceConfig: ScalaFutures.PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(50, Millis))

  // TODO test metadata credit suggestions

  //    def updateImageUserMetadata(id: String, data: String, lastModified: Any): Future[String] = {Future({
    //      //    val data = metadata \ "data"
    //      //    val lastModified = metadata \ "lastModified"
    //      //    Future.sequence( withImageId(metadata)(id => es.applyImageMetadataOverride(id, data, lastModified)))
    //      // TODO Implement!
    //      ???
    //    })}
    //
    //    def updateImageLeases(id: String, data: String, lastModified: Any): Future[String] = {Future({
    //      //    Future.sequence( withImageId(leaseByMedia)(id => es.updateImageLeases(id, leaseByMedia \ "data", leaseByMedia \ "lastModified")) )
    //      // TODO Implement!
    //      ???
    //    })}
    //
    //    def setImageCollections(id: String, data: String): Future[String] = {Future({
    //      //    Future.sequence(withImageId(collections)(id => es.setImageCollection(id, collections \ "data")) )
    //      // TODO Implement!
    //      ???
    //    })}
    //
    //    def updateRcsRights(id: String, data: String): Future[String] = {Future({
    //      //      Future.sequence( withImageId(rights)(id => es.updateImageSyndicationRights(id, rights \ "data")) )
    //      // TODO Implement!
    //      ???
    //    })}

}


