package com.gu.mediaservice.model

case class Instance(id: String) {
  override def toString: String = id  // TODO need to visit all the urls builders an make them use .id
}
