package com.gu.mediaservice.lib

import org.scalacheck.Properties
import org.scalacheck.Arbitrary._
import org.scalacheck.Gen._
import org.scalacheck.Prop.forAll

import scalaz.std.AllInstances._
import scalaz.syntax.foldable._
import scalaz.stream.Process
import Process._

import Processes._

object ProcessesSpec extends Properties("Processes") {

  property("unchunk") = forAll { xs: List[List[Int]] =>
    val p = Process(xs: _*)
    p.pipe(unchunk).toList == xs.flatten
  }

  val smallPosInt = choose(1, 10)

  property("seenThreshold") = forAll(listOf(arbitrary[Int]), smallPosInt) { (xs, n) =>
    val p = Process(xs: _*)
    val ys = p.pipe(seenThreshold(n)).toList
    val counts = xs.foldMap(x => Map(x -> 1))
    xs.forall(x => counts(x) / n == ys.count(_ == x))
  }

}
