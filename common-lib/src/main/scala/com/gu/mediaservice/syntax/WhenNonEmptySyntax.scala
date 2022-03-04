package com.gu.mediaservice.syntax

trait WhenNonEmptySyntax {
  implicit class WhenNonEmpty[A](self: List[A]) {

    /**
      * Converts an empty list to None, lists with one or more items remain defined
      */
    final def whenNonEmpty: Option[List[A]] = {
      if (self.nonEmpty) Some(self)
      else None
    }
  }
}

object WhenNonEmptySyntax extends WhenNonEmptySyntax
