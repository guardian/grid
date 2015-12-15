package lib

object AspectRatio {
  case class Ratio(friendly: Option[String], width: Int, height: Int)

  def gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)

  def calculate(width: Int, height: Int) : Option[Ratio] = {
    val knownRatios = List(
      Ratio(Some("5:3"), 5, 3),
      Ratio(Some("2:3"), 2, 3),
      Ratio(Some("16:9"), 16, 9)
    )
    val rGcd = gcd(width, height)
    val simplifiedWidth  = width / rGcd
    val simplifiedHeight = height / rGcd
    println(s"for ($width, $height) sHeight: $simplifiedHeight, sWidth: $simplifiedWidth where GCD was $rGcd")

    knownRatios.find(ratio => ratio.width == simplifiedWidth && ratio.height == simplifiedHeight)
 }
}
