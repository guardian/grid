package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

object BylineCreditReorganise extends MetadataCleaner {
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
      val bylineParts = byline.split("/").filter(!_.isEmpty)
      val creditParts = credit.split("/").filter(!_.isEmpty)

      if (bylineParts.length == 0 || (bylineParts.length == 1 && creditParts.length == 1)) {
        (byline, credit)
      } else {
        val outputByline = bylineParts.head

        val outputCredit = (bylineParts.tail.filter(!creditParts.contains(_)) ++ creditParts.filter(_ != outputByline)).distinct.mkString("/")

        (outputByline, outputCredit)
      }
    }
    // Convert the strings back to `Option`s
    .map{ case (b, c) => (Some(b), Some(c)) }
    // return the defaults if they both didn't exist
    .getOrElse((bylineField, creditField))

  def cleanField(field: Field) =
    field.map(condenseSpaceySlashes)

  def condenseSpaceySlashes(s: String): String = SpaceySlashes.replaceAllIn(s, "/")
}

