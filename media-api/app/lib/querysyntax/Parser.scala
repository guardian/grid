package lib.querysyntax

object Parser {

  private val thingsToHideByDefault = List(
    "is:deleted",
    "usages@status:replaced"
  )

  private val replacedUsage = Nested(SingleField("usages"), SingleField("usages.status"), Phrase("replaced"))

  def runResult(input: String): Either[String, List[Condition]] =
    parseResult(input).flatMap { parsedInput =>
      val mentionsReplaced = parsedInput.exists {
        case `replacedUsage` | NegationNested(`replacedUsage`) => true
        case _ => false
      }
      val mentionsDeleted = hasExplicitDeletedCondition(parsedInput)

      val defaultsToAdd = thingsToHideByDefault.filterNot {
        case "is:deleted" => mentionsDeleted
        case "usages@status:replaced" => mentionsReplaced
        case _ => false
      }
      val inputWithDefaults = defaultsToAdd.foldLeft(input) { (query, condition) =>
        query.concat(s" -$condition").trim
      }

      parseResult(inputWithDefaults).map(normalise)
    }

  def run(input: String): List[Condition] =
    runResult(input).fold(message => throw InvalidQuery(message), identity)

  def parseResult(input: String): Either[String, List[Condition]] =
    if (input.trim.isEmpty) Right(Nil)
    else new QuerySyntax(input.trim).Query.run().toOption.map(_.toList).toRight("Invalid query syntax")

  def parse(input: String): List[Condition] =
    parseResult(input).fold(message => throw InvalidQuery(message), identity)

  def explicitlyIncludesDeleted(conditions: List[Condition]): Boolean =
    conditions.exists {
      case Match(IsField, IsValue(value)) => isDeletedValue(value)
      case _ => false
    }

  private def hasExplicitDeletedCondition(conditions: List[Condition]): Boolean =
    conditions.exists {
      case Match(IsField, IsValue(value)) => isDeletedValue(value)
      case Negation(Match(IsField, IsValue(value))) => isDeletedValue(value)
      case _ => false
    }

  private def isDeletedValue(value: String): Boolean =
    value.equalsIgnoreCase("deleted")

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
