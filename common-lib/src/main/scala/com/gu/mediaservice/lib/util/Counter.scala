package com.gu.mediaservice.lib.util

import java.util.concurrent.atomic.AtomicLong
import scala.collection.mutable


class Counter(value: AtomicLong) {
  def this() = this(new AtomicLong())

  def incr(): Long = value.incrementAndGet
  def apply(): Long = value.get()

  override def toString() = "Counter(%d)".format(value.get())
}

