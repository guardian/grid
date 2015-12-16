package lib

import scala.annotation.tailrec

object AspectRatio {
  case class Ratio(friendly: String, width: Int, height: Int)

  val knownRatios = List(
    Ratio("5:3", 5, 3),
    Ratio("2:3", 2, 3),
    Ratio("16:9", 16, 9)
  )

  @tailrec
  def gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)

  def calculate(width: Int, height: Int, tolerance: Int = 3) : Option[Ratio] = {
    val matchingRatios = for {
      w <- width - tolerance until width + tolerance
      h <- height - tolerance until height + tolerance
      g = gcd(w, h)
      simplifiedWidth = w / g
      simplifiedHeight = h / g
      ratio <- knownRatios if ratio.width == simplifiedWidth &&  ratio.height == simplifiedHeight
    } yield ratio
    matchingRatios.headOption
  }
}
