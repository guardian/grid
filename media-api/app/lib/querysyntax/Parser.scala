package lib.querysyntax

object Parser {

  def run(input: String): List[Condition] = {
    normalise(
      parse(
        if(input.contains("is:deleted")) input
        else input.concat(" -is:deleted").trim
      )
    )
  }

  def parse(input: String): List[Condition] =
    new QuerySyntax(input.trim).Query.run().map(_.toList) getOrElse List()

  // Post-hoc normalisation that are harder to do via the PEG grammar
  def normalise(conditions: List[Condition]): List[Condition] = conditions match {
    // Merge consecutive terms into a single match (e.g. "cats and dogs")
    case Match(AnyField, Words(words1)) :: Match(AnyField, Words(words2)) :: xs =>
      normalise(Match(AnyField, Words(s"$words1 $words2")) :: xs)
    // Else, recursively match the next list tail
    case x :: xs => x :: normalise(xs)
    // Until we reach the end of the list
    case Nil => Nil
  }

}
