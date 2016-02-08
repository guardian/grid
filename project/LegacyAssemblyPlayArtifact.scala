package sbt.plugins

import sbt._
import sbt.Keys._
import sbtassembly.Plugin._
import sbtassembly.Plugin.AssemblyKeys._
import com.typesafe.sbt.packager

// Simplified version of legacy PlayArtifact plugin to dist assembly mega-JARs,
// to be used for legacy apps that won't be migrated to native-packager
object LegacyAssemblyPlayArtifact extends Plugin {

  val playArtifact = TaskKey[File]("play-artifact", "Builds a deployable zip file for magenta")
  val playArtifactResources = TaskKey[Seq[(File, String)]](
    "play-artifact-resources", "Files that will be collected by the deployment-artifact task")
  val playArtifactFile = SettingKey[String](
    "play-artifact-file", "Filename of the artifact built by deployment-artifact")

  val legacyMagentaPackageName = SettingKey[String]("magenta-package-name", "Name of the magenta package")

  lazy val legacyArtifactPlayArtifactDistSettings = assemblySettings ++ Seq(
    mainClass in assembly := Some("play.core.server.NettyServer"),
    jarName in assembly := "app.jar",

    // package config for Magenta and Upstart
    playArtifactResources <<= (assembly, baseDirectory, legacyMagentaPackageName) map {
      (assembly, base, packageName) => {
        Seq(
          base / "conf" / "deploy.json" -> "deploy.json",
          assembly -> s"packages/$packageName/${assembly.getName}"
        )
      }
    },

    playArtifactFile := "artifacts.zip",
    playArtifact <<= buildDeployArtifact,
    packager.Keys.dist <<= buildDeployArtifact tag Tags.Disk,
    assembly <<= assembly.tag(Tags.Disk)
  )

  private def buildDeployArtifact = (streams, target, playArtifactResources, playArtifactFile, legacyMagentaPackageName) map {
    (s, target, resources, artifactFileName, legacyMagentaPackageName) =>
      val distFile = target / artifactFileName
      s.log.info("Disting " + distFile)

      if (distFile.exists()) {
        distFile.delete()
      }
      IO.zip(resources, distFile)

      s.log.info("Done disting.")
      distFile
  }

}
