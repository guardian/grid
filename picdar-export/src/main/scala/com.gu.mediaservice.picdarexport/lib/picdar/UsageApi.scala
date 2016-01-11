package com.gu.mediaservice.picdarexport.lib.picdar

import scalaj.http._

import play.api.libs.concurrent.Execution.Implicits._
import scala.concurrent.Future

import com.gu.mediaservice.picdarexport.lib.usage.{PicdarUsageRecordFactory, PicdarUsageRecord}


object UsageApi {
  import com.gu.mediaservice.picdarexport.lib.Config.picdarUsageApiUrl

  def get(urn: String): Future[List[PicdarUsageRecord]] = Future {
    val response = Http(s"$picdarUsageApiUrl").param("xurn",urn).asString
    val responseString = response.body.trim

    val responseBody = responseString.isEmpty match {
      case true => None
      case false => Some(responseString)
    }

    responseBody.map(PicdarUsageRecordFactory.create).getOrElse(List())
  }
}
