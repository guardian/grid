package com.gu.mediaservice.lib.store

import java.io.{FileWriter, BufferedWriter, File}

import com.amazonaws.auth.AWSCredentials
import com.gu.mediaservice.lib.auth.BaseStore

import play.api.libs.json.{Json, JsValue}
import play.api.libs.concurrent.Execution.Implicits._

import scala.concurrent.Future

class JsonStore(bucket: String, credentials: AWSCredentials, storeName: String)
      extends BaseStore[String, JsValue](bucket, credentials) {

  val listName = "list"

  def getData: Future[JsValue] =
    store.future().map { json =>
      json.getOrElse(listName, Json.obj())
    }

  def update() = {
    store.sendOff(_ => updateList())
  }

  def putData(data: JsValue) = {
    // TODO: Find out how to return putObject as a promise as we are just assuming success now
    s3.client.putObject(bucket, storeName, tmpJsonFile(data.toString))
    update()
    data
  }

  private def tmpJsonFile(content: String): File = {
    val tmp = File.createTempFile(storeName, ".tmp")
    val bw = new BufferedWriter(new FileWriter(tmp))
    tmp.deleteOnExit()
    bw.write(content)
    bw.close()
    tmp
  }

  private def updateList(): Map[String, JsValue] = {
    val list = getS3Object(storeName) match {
      case Some(content) => Json.parse(content)
      case None          => Json.obj()
    }

    Map(listName -> list)
  }
}
