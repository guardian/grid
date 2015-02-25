package com.gu.mediaservice.picdarexport.lib

import java.util.concurrent.Executors

import scala.concurrent.ExecutionContext

object ExecutionContexts {
  // Rely on global pool for now, seems to hold
  implicit val picdar       = ExecutionContext.Implicits.global
  implicit val picdarAsset  = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.concurrencyPicdarAsset))
  implicit val mediaLoader  = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.concurrencyMediaLoader))
  implicit val mediaApi     = ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.concurrencyMediaApi))
}
