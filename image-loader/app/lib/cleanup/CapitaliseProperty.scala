package lib.cleanup

import lib.imaging.ImageMetadata

object CapitaliseByline extends MetadataCleaner with CapitalisationFixer {
  // Note: probably not exhaustive list
  override val joinWords = List("van", "der", "den", "dem", "von", "de", "du", "la", "et")

  def clean(metadata: ImageMetadata) =
    metadata.copy(byline = metadata.byline.map(fixCapitalisation))
}

object CapitaliseCity extends MetadataCleaner with CapitalisationFixer {
  def clean(metadata: ImageMetadata) =
    metadata.copy(city = metadata.city.map(fixCapitalisation))
}

object CapitaliseCountry extends MetadataCleaner with CapitalisationFixer {
  def clean(metadata: ImageMetadata) =
    metadata.copy(country = metadata.country.map(fixCapitalisation))
}



trait CapitalisationFixer {

  def fixCapitalisation(s: String): String =
    if (looksLikeAName(s) && isAllUpperCase(s)) {
      capitalise(s)
    } else s

  def capitalise(s: String): String = {
    val words = s.split(" ").filterNot(_.isEmpty)
    val capitalisedWords = words.zipWithIndex.map {
      case (word, index) => {
        val firstOrLastWord = List(0, words.size).contains(index)
        capitaliseWord(word.toLowerCase, firstOrLastWord)
      }
    }
    capitalisedWords.mkString(" ")
  }

  val joinWords: List[String] = List()

  val delimiters: List[String] = List("'", "-")

  def capitaliseWord(word: String, firstOrLast: Boolean): String = {
    // Don't capitalise join words (e.g. Fleur de la Cour)
    if (joinWords.contains(word) && !firstOrLast) {
      word
    } else {
      delimiters.foldLeft(word)(capitaliseAround)
    }
  }

  def capitaliseAround(s: String, delimiter: String): String =
    s.split(delimiter).map(_.capitalize).mkString(delimiter)


  // FIXME: is there no more efficient way of partial matching a regexp on a string?
  val notNumbersOrSlash = """[^/0-9]+"""
  def looksLikeAName(s: String): Boolean = s.matches(notNumbersOrSlash)

  def isAllUpperCase(s: String): Boolean = s == s.toUpperCase
}
