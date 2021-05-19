package lib.elasticsearch

import lib.querysyntax.{Nested, _}
import org.joda.time.{DateTime, DateTimeZone}

trait ConditionFixtures {

  val fieldPhraseMatchCondition = Match(SingleField("afield"), Phrase("avalue"))
  val wordsMatchCondition = Match(SingleField("awordfield"), Words("foo bar"))
  val anotherFieldPhraseMatchCondition = Match(SingleField("anotherfield"), Phrase("anothervalue"))

  val dateRangeStart: DateTime = new DateTime(2016, 1, 1, 0, 0).withZone(DateTimeZone.UTC)
  val dateRangeEnd: DateTime = dateRangeStart.plusHours(1)
  val dateMatchCondition = Match(SingleField("adatefield"), DateRange(dateRangeStart, dateRangeEnd))

  val hasFieldCondition = Match(HasField, HasValue("foo"))

  val isOwnedPhotoCondition = Match(IsField, IsValue(IsOwnedPhotograph("GNM").toString))
  val isOwnedIllustrationCondition = Match(IsField, IsValue(IsOwnedIllustration("GNM").toString))
  val isOwnedImageCondition = Match(IsField, IsValue(IsOwnedImage("GNM").toString))
  val isUnderQuotaCondition = Match(IsField, IsValue(IsUnderQuota(Nil).toString))
  val isInvalidCondition = Match(IsField, IsValue("a-random-string"))

  val hierarchyFieldPhraseCondition = Match(HierarchyField, Phrase("foo"))
  val anyFieldPhraseCondition = Match(AnyField, Phrase("cats and dogs"))
  val anyFieldWordsCondition = Match(AnyField, Words("cats dogs"))
  val multipleFieldWordsCondition = Match(MultipleField(List("foo", "bar")), Phrase("cats and dogs"))

  val nestedCondition: Condition = Nested(SingleField("usages"), SingleField("usages.status"), Words("pending"))
  val anotherNestedCondition: Condition = Nested(SingleField("something"), SingleField("something.field"), Phrase("dogs"))

}
