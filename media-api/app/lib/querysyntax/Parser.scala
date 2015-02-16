package lib.querysyntax

object Parser {

  def run(input: String): List[Condition] =
    new QuerySyntax(input).Query.run().map(_.toList) getOrElse List()

}
