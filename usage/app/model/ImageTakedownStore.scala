package model

import java.net.URI

case class ImageTakedownStore(var imageUrls: Map[String, List[URI]] = Map.empty) {

  def addImageUrls(imageId: String, urls: List[URI]): Unit = {
    imageUrls = imageUrls.updated(imageId, urls)
  }

  def getImageUrls(imageId: String): List[URI] = {
    imageUrls.getOrElse(imageId, List.empty)
  }

}
