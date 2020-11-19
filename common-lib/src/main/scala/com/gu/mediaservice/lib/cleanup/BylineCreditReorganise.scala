package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

/*
 Generic cleaner that normalises the byline and credit fields. They can come in various formats such as
 Photographer via Agency or Photographer/Agency or even Photographer via Agency/OtherAgency into the dedicated fields.
 */
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

  def removeBylineFromCredit(bylineField: Field, creditField: Field) =
    bylineField.map { byline =>
      val credit = creditField.getOrElse("")
      val bylineParts = byline.split(" via |/").filter(!_.isEmpty)
      val creditParts = credit.split(" via |/").filter(!_.isEmpty)

      // It's very difficult to decide how to reorganise the byline or credits if they're both single tokens
      // since we'd need to know what's likely to be a name and what's likely to be an organisation.
      val ambiguousBylineCredit = bylineParts.length == 0 || (bylineParts.length == 1 && creditParts.length == 1)

      if (ambiguousBylineCredit) {
        (byline, credit)
      } else {
        val outputByline = bylineParts.head

        val outputCredit = (bylineParts.tail.filter(!creditParts.contains(_)) ++ creditParts.filter(_ != outputByline)).distinct.mkString("/")

        (outputByline, outputCredit)
      }
    }
    // Convert the strings back to `Option`s
    .map{ case (b, c) => (Some(b), Some(c).filter(!_.isEmpty)) }
    // return the defaults if they both didn't exist
    .getOrElse((bylineField, creditField))

  def cleanField(field: Field) =
    field.map(condenseSpaceySlashes)

  def condenseSpaceySlashes(s: String): String = SpaceySlashes.replaceAllIn(s, "/")
}

