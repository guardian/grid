package lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

object ByLineCreditReorganise extends MetadataCleaner {
  type Field = Option[String]

  val SpaceySlashes = """\s*\/\s*""".r

  override def clean(metadata: ImageMetadata): ImageMetadata = {
    val cleanByline = cleanField(metadata.byline)
    val cleanCredit = cleanField(metadata.credit)

    val (byline, credit) = removeBylineFromCredit(cleanByline, cleanCredit)
    metadata.copy(
      byline = byline,
      credit = credit
    )
  }

  def bothExist(byline: Field, credit: Field): Option[(String, String)] =
    for(b <- byline; c <- credit) yield (b, c)

  def removeBylineFromCredit(bylineField: Field, creditField: Field) =
    bothExist(bylineField, creditField).map { case (byline, credit) =>
      (byline.split("/", 2).toList, credit.split("/", 2).toList) match {
        // if no split, business as usual
        case ((b1 :: Nil, c1 :: Nil)) => (b1, c1)

        // if we have a split, and the first split is the same, remove if from credit
        // and use it as byline, the rest is the credit
        case ((b1 :: bTail), (c1 :: cTail)) if (b1 == c1) => (b1, cTail.head)
        case _ => (byline, credit)
      }
    }
    // Convert the strings back to `Option`s
    .map{ case (b, c) => (Some(b), Some(c)) }
    // return the defaults if they both didn't exist
    .getOrElse((creditField, bylineField))

  def cleanField(field: Field) =
    field.map(condenseSpaceySlashes)

  def condenseSpaceySlashes(s: String): String = SpaceySlashes.replaceAllIn(s, "/")

}

