package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.logging.LogConfig
import play.api.ApplicationLoader.Context
import play.api.{Application, ApplicationLoader}

abstract class GridAppLoader(loadFn: Context => GridComponents) extends ApplicationLoader {
  final override def load(context: Context): Application = {
    LogConfig.initPlayLogging(context)

    val gridApp = loadFn(context)
    LogConfig.initKinesisLogging(gridApp.config)

    gridApp.application
  }
}
