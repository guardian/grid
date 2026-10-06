package lib.querysyntax

object Parser {

  private val thingsToHideByDefault = List(
    "is:deleted",
    "usages@status:replaced"
  )

  private val replacedUsage = Nested(SingleField("usages"), SingleField("usages.status"), Phrase("replaced"))

  def run(input: String): List[Condition] = {
    val mentionsReplaced = parse(input).exists {
      case `replacedUsage` | NegationNested(`replacedUsage`) => true
      case _ => false
    }

    val defaultsToAdd = thingsToHideByDefault.filterNot {
      case "usages@status:replaced" => mentionsReplaced
      case condition => input.contains(condition)
    }
    val inputWithDefaults = defaultsToAdd.foldLeft(input) { (query, condition) =>
      query.concat(s" -$condition").trim
    }

    // Parse again after inserting defaults to retain the existing malformed-query fallback.
    normalise(parse(inputWithDefaults))
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
