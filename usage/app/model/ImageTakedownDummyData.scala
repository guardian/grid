package model

import com.gu.mediaservice.model.{Bounds, Crop, CropSpec}
import com.gu.mediaservice.model.usage._
import org.joda.time.DateTime

import java.net.URI

object ImageTakedownDummyData {
  private val createdAt = DateTime.parse("2026-09-01T10:30:00.000Z")

  val contentWithImages: List[ContentWithImages] = List(
    ContentWithImages(
      contentId = "world/2026/sep/01/example-live-article",
      webTitle = "Example live article",
      webUrl = "https://www.theguardian.com/world/2026/sep/01/example-live-article",
      imageIds = List("https://media.guimcode.co.uk/36de9357b650f4ce17f5c3dac9bfd86a77860352/608_0_6080_4864/2000.jpg")
    ),
    ContentWithImages(
      contentId = "sport/2026/sep/02/example-gallery",
      webTitle = "Example gallery",
      webUrl = "https://www.theguardian.com/sport/2026/sep/02/example-gallery",
      imageIds = List("https://media.guimcode.co.uk/36de9357b650f4ce17f5c3dac9bfd86a77860352/608_0_6080_4864/2000.jpg",
        "https://media.guimcode.co.uk/36de9357b650f4ce17f5c3dac9bfd86a77860352/0_0_6080_4864/2000.jpg")
    )
  )

  val crops: List[Crop] = List(
    Crop(
      id = Some("0_0_1600_900"),
      author = Some("example.user@example.com"),
      date = Some(createdAt),
      specification = CropSpec(
        uri = "https://media.example.com/dummy-image-id",
        bounds = Bounds(x = 0, y = 0, width = 1600, height = 900),
        aspectRatio = Some("16:9"),
        rotation = None
      ),
      master = None,
      assets = Nil
    ),
    Crop(
      id = Some("300_0_900_1200"),
      author = Some("example.user@example.com"),
      date = Some(createdAt.plusHours(1)),
      specification = CropSpec(
        uri = "https://media.example.com/dummy-image-id",
        bounds = Bounds(x = 300, y = 0, width = 900, height = 1200),
        aspectRatio = Some("3:4"),
        rotation = None
      ),
      master = None,
      assets = Nil
    )
  )

  val usages: List[Usage] = List(
    Usage(
      id = "1234567890",
      references = List(
        UsageReference(
          `type` = ComposerUsageReference,
          uri = Some(new URI("https://www.theguardian.com/world/2026/sep/01/example-live-article")),
          name = Some("Example live article")
        )
      ),
      platform = DigitalUsage,
      media = "image",
      status = PublishedUsageStatus,
      dateAdded = Some(createdAt),
      dateRemoved = None,
      lastModified = createdAt
    ),
    Usage(
      id = "1234567891",
      references = List(
        UsageReference(
          `type` = ComposerUsageReference,
          uri = Some(new URI("https://www.theguardian.com/sport/2026/sep/02/example-gallery")),
          name = Some("Example gallery")
        )
      ),
      platform = DigitalUsage,
      media = "image",
      status = RemovedUsageStatus,
      dateAdded = Some(createdAt.plusDays(1)),
      dateRemoved = Some(createdAt.plusDays(2)),
      lastModified = createdAt.plusDays(2)
    )
  )
}

