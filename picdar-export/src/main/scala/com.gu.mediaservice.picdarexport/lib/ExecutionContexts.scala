package com.gu.mediaservice.picdarexport.lib

import java.util.concurrent.Executors

import scala.concurrent.ExecutionContext

object ExecutionContexts {
  implicit val picdar       = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(2))
  implicit val mediaService = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(2))
}
