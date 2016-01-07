package lib

import java.net.URL
import scala.util.Try
import org.joda.time.DateTime

import com.gu.mediaservice.model.{DigitalUsageMetadata, PrintUsageMetadata, PrintImageSize}
import com.gu.contentapi.client.model.v1.{Content, Element}


object UsageMetadataBuilder {

  def buildDigital(metadataMap: Map[String, Any]): Option[DigitalUsageMetadata] = {
    Try {
      DigitalUsageMetadata(
        metadataMap.get("webTitle").get.asInstanceOf[String],
        metadataMap.get("webUrl").get.asInstanceOf[String],
        metadataMap.get("sectionId").get.asInstanceOf[String],
        metadataMap.get("composerUrl").map(_.asInstanceOf[String])
      )
    }.toOption
  }

  def buildPrint(metadataMap: Map[String, Any]): Option[PrintUsageMetadata] = {
    type JStringNumMap = java.util.LinkedHashMap[String, java.math.BigDecimal]
    import com.gu.mediaservice.model.DateFormat

    Try {
      PrintUsageMetadata(
        metadataMap.apply("sectionName").asInstanceOf[String],
        metadataMap.get("issueDate").map(_.asInstanceOf[String])
          .map(DateFormat.parser.parseDateTime).get,
        metadataMap.apply("pageNumber").asInstanceOf[java.math.BigDecimal].intValue,
        metadataMap.apply("storyName").asInstanceOf[String],
        metadataMap.apply("publicationCode").asInstanceOf[String],
        metadataMap.apply("publicationName").asInstanceOf[String],
        metadataMap.apply("layoutId").asInstanceOf[java.math.BigDecimal].intValue,
        metadataMap.apply("edition").asInstanceOf[java.math.BigDecimal].intValue,
        metadataMap.get("size")
          .map(_.asInstanceOf[JStringNumMap])
          .map(m => PrintImageSize(m.get("x").intValue, m.get("y").intValue)).get,
        metadataMap.apply("orderedBy").asInstanceOf[String],
        metadataMap.apply("sectionCode").asInstanceOf[String]
      )
    }.toOption
  }

  def build(content: Content): DigitalUsageMetadata = {
    DigitalUsageMetadata(
      content.webTitle,
      content.webUrl,
      content.sectionId.getOrElse("none"),
      composerUrl(content)
    )
  }

  def composerUrl(content: Content): Option[String] = content.fields
    .flatMap(_.internalComposerCode)
    .flatMap(composerId => {
      Try((new URL(s"${Config.composerBaseUrl}/${composerId}")).toString).toOption
    })

}
