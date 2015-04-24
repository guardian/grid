package lib.querysyntax

object Parser {

  def run(input: String): List[Condition] =
    new QuerySyntax(input.trim).Query.run().map(_.toList) getOrElse List()

}
