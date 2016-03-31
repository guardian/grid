package lib

import scala.annotation.tailrec

object AspectRatio {
  case class Ratio(friendly: String, width: Int, height: Int)

  val knownRatios = List(
    Ratio("5:3", 5, 3),
    Ratio("2:3", 2, 3),
    Ratio("16:9", 16, 9),
    Ratio("1:1", 1, 1)
  )

  def clean(aspect: String): Option[Float] = knownRatios
    .find(_.friendly == aspect)
    .map(ratio => (ratio.width.toFloat/ratio.height.toFloat))

  @tailrec
  def gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)

  def calculate(width: Int, height: Int, tolerance: Int = 3) : Option[Ratio] = {
    val matchingRatio = for {
      w <- width - tolerance until width + tolerance
      h <- height - tolerance until height + tolerance
      g = gcd(w, h)
      simplifiedWidth = w / g
      simplifiedHeight = h / g
      ratio <- knownRatios.find(ratio => ratio.width == simplifiedWidth &&  ratio.height == simplifiedHeight)
    } yield ratio
    matchingRatio.headOption
  }
}
