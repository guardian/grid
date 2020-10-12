package com.gu.mediaservice.lib.play

import com.gu.mediaservice.lib.config.GridConfigLoader
import com.gu.mediaservice.lib.logging.LogConfig
import play.api.ApplicationLoader.Context
import play.api.{Application, ApplicationLoader}

abstract class GridAppLoader(appName: String, loadFn: Context => GridComponents) extends ApplicationLoader {
  final override def load(context: Context): Application = {
    LogConfig.initPlayLogging(context)

    val fileConfig = GridConfigLoader.read(appName, context.environment.mode)
    val gridApp = loadFn(context.copy(initialConfiguration = context.initialConfiguration ++ fileConfig))
    LogConfig.initKinesisLogging(gridApp.config)
    LogConfig.initLocalLogShipping(gridApp.config)

    gridApp.application
  }
}
