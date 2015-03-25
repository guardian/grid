package com.gu.mediaservice.lib.argo

trait WriteHelpers {

  // TODO: apply trick to ImageMetadata?
  def someListOrNone[T](list: List[T]) = if (list.isEmpty) None else Some(list)

}
