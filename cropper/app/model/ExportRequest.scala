package model

import lib.AspectRatio
import play.api.libs.functional.syntax._
import play.api.libs.json._
import play.api.libs.json.Reads._

import com.gu.mediaservice.model._


sealed trait ExportRequest {
  val uri: String
}

case class FullExportRequest(uri: String) extends ExportRequest

case class CropRequest(uri: String, bounds: Bounds, aspectRatio: Option[String]) extends ExportRequest


object ExportRequest {

  private val aspectRatioLike = """\d+:\d+""".r

  private val readCropRequest: Reads[CropRequest] = (
    (__ \ "source").read[String] ~
    __.read[Bounds] ~
    (__ \ "aspectRatio").readNullable[String](pattern(aspectRatioLike))
  )(CropRequest.apply _)

  private val readFullExportRequest: Reads[FullExportRequest] =
    (__ \ "source").read[String].map(FullExportRequest.apply)

  implicit val readExportRequest: Reads[ExportRequest] = Reads[ExportRequest](jsValue =>
    (jsValue \ "type").validate[String] match {
      case JsSuccess("crop", _) => readCropRequest.reads(jsValue)
      case JsSuccess("full", _) => readFullExportRequest.reads(jsValue)
      case _ => JsError("invalid type")
    }
  )

  def boundsFill(dimensions: Dimensions): Bounds = Bounds(0, 0, dimensions.width, dimensions.height)

  def toCropSpec(cropRequest: ExportRequest, dimensions: Dimensions): CropSpec = cropRequest match {
    case FullExportRequest(uri)          =>
      CropSpec(
        uri,
        boundsFill(dimensions),
        AspectRatio.calculate(dimensions.width, dimensions.height).map(_.friendly),
        FullExport
      )
    // Map "crop" that covers the whole image to a "full" export
    case CropRequest(uri, bounds, ratio) if bounds == boundsFill(dimensions)
                                         => CropSpec(uri, boundsFill(dimensions), ratio, FullExport)
    case CropRequest(uri, bounds, ratio) => CropSpec(uri, bounds, ratio, CropExport)
  }

}
