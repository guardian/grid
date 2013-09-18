package com.gu.mediaservice.thrall

import scala.util.Random

object Main extends App {

  println(s"You have conjured a Potent ${Random.shuffle(Seq("Flame", "Frost", "Storm")).head} Thrall!")

}
