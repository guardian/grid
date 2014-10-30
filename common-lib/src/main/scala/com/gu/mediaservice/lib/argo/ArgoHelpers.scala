package com.gu.mediaservice.lib.argo

trait ArgoHelpers {
  // TODO: replace Ok(...).as(ArgoMediaType) boilerplate with
  //       either a Filter or some Action helper
  // FIXME: should also apply to error responses
  val ArgoMediaType = "application/vnd.argo+json"
}
