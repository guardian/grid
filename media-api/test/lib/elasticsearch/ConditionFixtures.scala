package lib.elasticsearch

import lib.querysyntax.{Match, Phrase, SingleField, Words}

trait ConditionFixtures {

  val fieldPhraseMatchCondition = Match(SingleField("afield"), Phrase("avalue"))
  val wordsMatchCondition = Match(SingleField("awordfield"), Words("foo bar"))
  val anotherFieldPhraseMatchCondition = Match(SingleField("anotherfield"), Phrase("anothervalue"))

}
