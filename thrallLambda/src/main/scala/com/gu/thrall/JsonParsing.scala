package com.gu.thrall

import com.gu.mediaservice.model.{Edits, SyndicationRights}
import com.gu.thrall.config.{ElasticSearchResponse, _}
import com.typesafe.scalalogging.StrictLogging
import org.joda.time.DateTime
import play.api.libs.json._

import scala.concurrent.Future

object JsonParsing extends StrictLogging {

  implicit val elasticSearchHitRead: Reads[ElasticSearchHit] {
    def reads(js: JsValue): JsResult[ElasticSearchHit]
  } = new Reads[ElasticSearchHit] {
    override def reads(js: JsValue): JsResult[ElasticSearchHit] = {
      try {
        JsSuccess(ElasticSearchHit(
          (js \ "_source").as[Image]
        ))
      } catch {
        case e:JsResultException => JsError(e.getMessage)
      }
    }
  }

  implicit val elasticSearchHitsRead: Reads[ElasticSearchHits] {
    def reads(js: JsValue): JsResult[ElasticSearchHits]
  } = new Reads[ElasticSearchHits] {
    override def reads(js: JsValue): JsResult[ElasticSearchHits] = {
      try {
        JsSuccess(ElasticSearchHits(
          (js \ "total").as[Int],
          (js \ "hits").asOpt[List[ElasticSearchHit]]
        ))
      } catch {
        case e:JsResultException => JsError(e.getMessage)
      }
    }
  }

  implicit val elasticSearchResponseRead: Reads[ElasticSearchResponse] {
    def reads(js: JsValue): JsResult[ElasticSearchResponse]
  } = new Reads[ElasticSearchResponse] {
    override def reads(js: JsValue): JsResult[ElasticSearchResponse] = {
      try {
        JsSuccess(ElasticSearchResponse(
          (js \ "total").asOpt[Int],
          (js \ "hits").asOpt[ElasticSearchHits],
          (js \ "suggest").getOrElse(JsNull)
        ))
      } catch {
        case e:JsResultException => JsError(e.getMessage)
      }
    }
  }

  implicit val imageMessageRead: Reads[Image] {
    def reads(js: JsValue): JsResult[Image]
  } = new Reads[Image] {
    override def reads(js: JsValue): JsResult[Image] = {
      try {
        val id = try {
          (js \ "id").as[Int].toString
        } catch {
          case e:JsResultException => (js \ "id").as[String]
        }
        JsSuccess(Image(
          id,
          (js \ "data").toOption,
          (js \ "syndicationRights").asOpt[SyndicationRights],
          (js \ "lastModified").asOpt[String].map(s => DateTime.parse(s)),
          Some(Json.stringify(js))
        ))
      } catch {
        case e:JsResultException => JsError(e.getMessage)
      }
     }
  }

  implicit val snsRead: Reads[Sns] {
    def reads(js: JsValue): JsResult[Sns]
  } = new Reads[Sns] {
    override def reads(js: JsValue): JsResult[Sns] = {
      val message = (js \ "Message").validate[String].get
      extractEither[Image](message) fold (
        a => JsError(a),
        imageMessage =>
          JsSuccess(config.Sns(
            (js \ "Subject").as[String],
            imageMessage
          ))
      )
    }
  }


  implicit val invokingEventRecordRead: Reads[InvokingEventRecord] {
    def reads(js: JsValue): JsResult[InvokingEventRecord]
  } = new Reads[InvokingEventRecord] {
    override def reads(js: JsValue): JsResult[InvokingEventRecord] = {
      JsSuccess(config.InvokingEventRecord(
        (js \ "EventVersion").as[String],
        (js \ "EventSubscriptionArn").as[String],
        (js \ "EventSource").as[String],
        (js \ "Sns").as[Sns]
      ))
    }
  }

  implicit val invokingEventRead: Reads[InvokingEvent] {
    def reads(js: JsValue): JsResult[InvokingEvent]
  } = new Reads[InvokingEvent] {
    override def reads(js: JsValue): JsResult[InvokingEvent] = {
      JsSuccess(config.InvokingEvent(
        (js \ "Records").as[Array[InvokingEventRecord]]
      ))
    }
  }

  def imageDetails(record: JsValue): Either[String, Image] = extractEither[Image](record)

  def editDetails(record: JsValue): Either[String, Edits] = extractEither[Edits](record)

  def syndicationRightsDetails(record: JsValue): Either[String, SyndicationRights] = extractEither[SyndicationRights](record)

  def recordDetails(record: String): Future[InvokingEventRecord] = extractFuture[InvokingEventRecord](record)

  def snsDetails(sns: String): Future[Sns] = extractFuture[Sns](sns)

  def imageDetails(image: String): Future[Image] = extractFuture[Image](image)

  def elasticSearchResponseDetails(response: String) = extractEither[ElasticSearchResponse](response)

  private[gu] def extractFuture[A](json: String)(implicit rds: Reads[A]): Future[A] = {
    Json.parse(json).validate[A].fold(
      errs => {
        errs.foreach(err => logger.error(err.toString))
        Future.failed(new Exception("Unable to parse json"))
      },
      Future.successful
    )
  }

  private[gu] def extractEither[A](json: String)(implicit rds: Reads[A]): Either[String, A] = {
    extractEither[A](Json.parse(json))
  }

  private[gu] def extractEither[A](json: JsValue)(implicit rds: Reads[A]): Either[String, A] = {
    json.validate[A].fold(
      errs => {
        errs.foreach(err => logger.error(err.toString))
        Left("Unable to parse json")
      },
      Right(_)
    )
  }
}
