package lib.imaging

object ImageMetadata {

  def fromFileMetadata(fileMetadata: FileMetadata): ImageMetadata =
    ImageMetadata(
      description         = fileMetadata.iptc.get("Caption/Abstract"),
      credit              = fileMetadata.iptc.get("Credit"),
      byline              = fileMetadata.iptc.get("By-line"),
      title               = fileMetadata.iptc.get("Headline"),
      copyrightNotice     = fileMetadata.iptc.get("Copyright Notice"),
      // FIXME: why default to copyrightNotice again?
      copyright           = fileMetadata.exif.get("Copyright") orElse fileMetadata.iptc.get("Copyright Notice"),
      suppliersReference  = fileMetadata.iptc.get("Original Transmission Reference") orElse fileMetadata.iptc.get("Object Name"),
      source              = fileMetadata.iptc.get("Source"),
      specialInstructions = fileMetadata.iptc.get("Special Instructions"),
      keywords            = fileMetadata.iptc.get("Keywords") map (_.split(Array(';', ',')).toList) getOrElse Nil,
      city                = fileMetadata.iptc.get("City"),
      country             = fileMetadata.iptc.get("Country/Primary Location Name")
    )

}

case class ImageMetadata(
  description:         Option[String],
  credit:              Option[String],
  byline:              Option[String],
  title:               Option[String],
  copyrightNotice:     Option[String],
  copyright:           Option[String],
  suppliersReference:  Option[String],
  source:              Option[String],
  specialInstructions: Option[String],
  keywords:            List[String],
  city:                Option[String],
  country:             Option[String]
)
