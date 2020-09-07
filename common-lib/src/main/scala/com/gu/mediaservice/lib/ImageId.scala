package com.gu.mediaservice.lib

import _root_.play.api.libs.json._

trait ImageId {

  def withImageId[A](image: JsValue)(f: String => A): A = {
    (image \ "id").validate[String].asOpt.map(f).getOrElse {
      sys.error(s"No id field present in message body: $image")
    }
  }

}
