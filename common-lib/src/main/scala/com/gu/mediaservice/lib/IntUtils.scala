package com.gu.mediaservice.lib

object IntUtils {
  implicit class IntUtilities(val i: Int) {
    def toOrdinal: String = {
      val ordinal = i % 10 match {
        case 1 => "st"
        case 2 => "nd"
        case 3 => "rd"
        case _ => "th"
      }

      s"$i$ordinal"
    }
  }
}
