package com.gu.mediaservice.lib.config

import java.io.File

import com.typesafe.config.ConfigFactory
import com.typesafe.scalalogging.StrictLogging
import play.api.{Configuration, Mode}

object GridConfigLoader extends StrictLogging {
  val STAGE_KEY = "grid.stage"
  val APP_KEY = "grid.appName"

  def read(appName: String, mode: Mode): Configuration = {
    val stageIdentifier = new StageIdentifier
    // list of files to load for each mode, later files override earlier files
    val developerConfigFiles = Seq(
      s"${System.getProperty("user.home")}/.grid/common.conf",
      s"${System.getProperty("user.home")}/.grid/$appName.conf"
    )
    val deployedConfigFiles = Seq(
      s"/etc/gu/grid-prod.properties",
      s"/etc/grid/common.conf",
      s"/etc/gu/$appName.properties",
      s"/etc/grid/$appName.conf"
    )

    val baseConfig = Configuration.from(Map(
      STAGE_KEY -> stageIdentifier.stage,
      APP_KEY -> appName
    ))

    val fileConfiguration: Configuration = {
      if (mode == Mode.Test) {
        // when in test mode never load any files
        Configuration.empty
      } else if (stageIdentifier.isDev) {
        loadConfiguration(developerConfigFiles)
      } else {
        loadConfiguration(deployedConfigFiles)
      }
    }

    baseConfig ++ fileConfiguration
  }

  private def loadConfiguration(file: File): Configuration = {
    if (file.exists) {
      logger.info(s"Loading config from $file")
      if (file.getPath.endsWith(".properties")) {
        logger.warn(s"Configuring the Grid with Java properties files is deprecated as of #3011, please switch to .conf files. See #3037 for a conversion utility.")
      }
      Configuration(ConfigFactory.parseFile(file))
    } else {
      logger.info(s"Skipping config file $file as it doesn't exist")
      Configuration.empty
    }
  }

  private def loadConfiguration(fileNames: Seq[String]): Configuration = {
    fileNames.foldLeft(Configuration.empty) { case (config, fileName) =>
      config ++ loadConfiguration(new File(fileName))
    }
  }

}
