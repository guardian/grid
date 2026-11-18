package com.gu.mediaservice.scripts.key

import java.security.SecureRandom

object KeyGenerator {
  def randomKey(length: Int = 48): String = {
    val chars = ('A' to 'Z') ++ ('a' to 'z') ++ ('0' to '9')
    val rnd = new SecureRandom()
    Iterator.continually(chars(rnd.nextInt(chars.length))).take(length).mkString
  }

}
