package lib.querysyntax



object Parser {

  def run(input: String): List[SubQuery] = {
    normalise(
      parse(
        // TODO resurrect in a better way
//        if(input.contains("is:deleted")) input
//        else input.concat(" -is:deleted").trim
        input
      )
    )
  }

  def parse(input: String): List[SubQuery] =
    new QuerySyntax(input.trim).Query.run().map(_.toList).getOrElse(List())
      .map {
        case SubQuery(conditions) if !conditions.contains(Match(IsField, IsValue("deleted"))) => SubQuery(conditions :+ Negation(Match(IsField, IsValue("deleted"))))
        case s => s
      }

  // Post-hoc normalisation that are harder to do via the PEG grammar
  def normalise(subqueries: List[SubQuery]): List[SubQuery] = subqueries.map { subquery =>
    SubQuery(conditions = normaliseConditions(subquery.conditions))
  }

  private def normaliseConditions(conditions: List[Condition]): List[Condition] = conditions match {
    // Merge consecutive terms into a single match (e.g. "cats and dogs")
    case Match(AnyField, Words(words1)) :: Match(AnyField, Words(words2)) :: xs =>
      normaliseConditions(Match(AnyField, Words(s"$words1 $words2")) :: xs)
    // Else, recursively match the next list tail
    case x :: xs => x :: normaliseConditions(xs)
    // Until we reach the end of the list
    case Nil => Nil
  }

}
