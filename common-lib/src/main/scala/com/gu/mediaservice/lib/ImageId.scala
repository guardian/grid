package com.gu.mediaservice.lib

import _root_.play.api.libs.json._
import com.gu.mediaservice.lib.logging.GridLogging

trait ImageId extends GridLogging {

  def withImageIdAndInstance[A](image: JsValue)(f: (String, String) => A): A = {
    (for {
      id <- (image \ "id").validate[String].asOpt
      instance <- (image \ "instance").validate[String].asOpt
    } yield {
      (id, instance)
    }).map((a: (String, String)) => f(a._1, a._2))
      .getOrElse {
      sys.error(s"No id and/or instance field present in message body: $image")
    }
  }

}
