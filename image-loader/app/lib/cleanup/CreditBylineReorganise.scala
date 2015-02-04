package lib.cleanup

import lib.imaging.ImageMetadata
import lib.cleanup.StripCopyrightPrefix.stripCopyrightPrefix

object CreditBylineReorganise extends MetadataCleaner {
  type CreditAndByline = (String, String)

  val SpaceySlashes = """\s?\/\s?""".r

  override def clean(metadata: ImageMetadata): ImageMetadata = {
    val cleanCredit = cleanField(metadata.credit)
    val cleanByline = cleanField(metadata.byline)


    val (credit, byline) = reorganise(cleanCredit, cleanByline)
    metadata.copy(
      credit = credit,
      byline = byline
    )
  }

  def bothExist(credit: Option[String], byline: Option[String]): Option[(String, String)] =
    for(c <- credit; b <- byline) yield (c, b)

  def reorganise(credit: Option[String], byline: Option[String]): (Option[String], Option[String]) =
    bothExist(credit, byline)
      .map((removeBylineFromCredit _).tupled)
      .map { case (c, b) =>
        (Some(c), Some(b))
      }.getOrElse((credit, byline))

  def removeBylineFromCredit(credit: String, byline: String): CreditAndByline = {
    val splitC = credit.split("/", 2).toList
    val splitB = byline.split("/", 2).toList

    // TODO: Some sort of Zip must work here
    if (splitC.head == splitB.head) {
      (splitC.tail.mkString, splitB.head)
    } else {
      (credit, byline)
    }
  }

  def cleanField(field: Option[String]) =
    field
      .map(stripCopyrightPrefix)
      .map(condenseSpaceySlashes)


  def condenseSpaceySlashes(s: String): String = SpaceySlashes.replaceAllIn(s, "/")

}
