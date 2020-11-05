package com.gu.mediaservice.lib.config

import java.io.File

import com.typesafe.config.ConfigFactory
import com.typesafe.scalalogging.StrictLogging
import play.api.{Configuration, Mode}

object GridConfigLoader extends StrictLogging {
  val STAGE_KEY = "grid.stage"
  val APP_KEY = "grid.appName"

  def read(appName: String, mode: Mode): Configuration = {
    assertNoDeprecatedConfiguration(appName)

    val stageIdentifier = new StageIdentifier
    // list of files to load for each mode, later files override earlier files
    val developerConfigFiles = Seq(
      s"${System.getProperty("user.home")}/.grid/common.conf",
      s"${System.getProperty("user.home")}/.grid/$appName.conf"
    )
    val deployedConfigFiles = Seq(
      s"/etc/grid/common.conf",
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

  private def assertNoDeprecatedConfiguration(appName: String): Unit = {
    // We should fail fast if we find any files that we used to process but now don't to avoid coming up in an
    // incompletely configured state.
    val deprecatedConfigFiles = Seq(
      s"/etc/gu/grid-prod.properties",
      s"/etc/gu/$appName.properties"
    )
    val deprecatedConfigFilesThatExist = deprecatedConfigFiles.filter(new File(_).isFile)
    assert(
      deprecatedConfigFilesThatExist.isEmpty,
      s"One or more deprecated configuration files found: ${deprecatedConfigFilesThatExist.mkString(", ")} - please see https://github.com/guardian/grid/pull/3011"
    )
  }

}
