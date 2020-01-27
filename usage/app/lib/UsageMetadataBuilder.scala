package lib

import java.net.URI

import com.gu.contentapi.client.model.v1.Content
import com.gu.mediaservice.model.usage._

import scala.util.Try

class UsageMetadataBuilder(config: UsageConfig) {

  def composerUrl(content: Content): Option[URI] = content.fields
    .flatMap(_.internalComposerCode)
    .flatMap(composerId => {
      Try(URI.create(s"${config.composerContentBaseUrl}/$composerId")).toOption
    })

  def build(content: Content): DigitalUsageMetadata = {
    DigitalUsageMetadata(
      URI.create(content.webUrl),
      content.webTitle,
      content.sectionId.getOrElse("none"),
      composerUrl(content)
    )
  }
}
