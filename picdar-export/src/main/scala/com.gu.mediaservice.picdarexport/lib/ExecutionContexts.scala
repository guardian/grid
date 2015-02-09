package com.gu.mediaservice.picdarexport.lib

import java.util.concurrent.Executors

import scala.concurrent.ExecutionContext

object ExecutionContexts {
  // Rely on global pool for now, seems to hold
  implicit val picdar       = ExecutionContext.Implicits.global
  implicit val picdarAsset  = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.concurrencyPicdarAsset))
  implicit val mediaService = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.concurrencyMediaLoader))
}
