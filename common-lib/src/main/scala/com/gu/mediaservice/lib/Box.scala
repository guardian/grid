package com.gu.mediaservice.lib

import java.util.concurrent.atomic.AtomicReference

abstract class Box[T] {
  def get(): T
  def apply(): T

  def send(t: T): Unit
  def send(f: T => T): Unit

  def map[A](f: T => A): Box[A]
  def flatMap[A](f: T => Box[A]): Box[A]
}

object Box {
  def apply[T](initialValue: T): Box[T] = new AtomicRefBox[T](initialValue)
}

// Note the omission of modify and alter
// (https://github.com/guardian/box/blob/master/src/main/scala/com/gu/Box.scala#L38).
// These functions aren't used in grid and the modify function had not been
// implemented correctly in the Box library.
private class AtomicRefBox[T](initialValue: T) extends Box[T] {
  // Note the name of this initial value. This has a different name those in
  // the methods below to ensure the correct scope of named variables.
  private val ref: AtomicReference[T] = new AtomicReference[T](initialValue)

  def apply(): T = ref.get()
  def get(): T = ref.get()

  def send(t: T): Unit = ref.set(t)
  def send(f: T => T): Unit = ref.updateAndGet(t => f(t))

  def map[A](f: T => A): Box[A] = new AtomicRefBox[A](f(get()))
  def flatMap[A](f: T => Box[A]): Box[A] = f(get())
}
