package lib.elasticsearch

import lib.querysyntax.{Match, Phrase, SingleField}

trait ConditionFixtures {

  val fieldPhraseMatchCondition = Match(SingleField("afield"), Phrase("avalue"))
  val anotherFieldPhraseMatchCondition = Match(SingleField("anotherfield"), Phrase("anothervalue"))

}
