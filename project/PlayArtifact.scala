package sbt.plugins

import sbt._
import sbt.Keys._
import com.typesafe.sbt.SbtNativePackager._
import com.typesafe.sbt.packager.Keys._

object PlayArtifact extends Plugin {

  val playArtifact = TaskKey[File]("play-artifact", "Builds a deployable zip file for magenta")
  val playArtifactResources = TaskKey[Seq[(File, String)]](
    "play-artifact-resources", "Files that will be collected by the deployment-artifact task")
  val playArtifactFile = SettingKey[String](
    "play-artifact-file", "Filename of the artifact built by deployment-artifact")

  val magentaPackageName = SettingKey[String]("magenta-package-name", "Name of the magenta package")

  val playArtifactDistSettings = Seq(
    name in Universal := name.value,

    // don't nest everything within APP-VERSION directory
    topLevelDirectory := None,

    // don't package docs
    sources in (Compile,doc) := Seq.empty,
    publishArtifact in (Compile, packageDoc) := false,

    playArtifactResources := (Seq(
      // upstart config file
      baseDirectory.value / "conf" / (magentaPackageName.value + ".conf") ->
        (s"packages/${magentaPackageName.value}/${magentaPackageName.value}.conf"),

      baseDirectory.value / "conf" / "start.sh" -> s"packages/${magentaPackageName.value}/start.sh",

      // the ZIP
      dist.value -> s"packages/${magentaPackageName.value}/app.zip",

      // and the riff raff deploy instructions
      baseDirectory.value / "conf" / "deploy.json" -> "deploy.json"
    ) ++ (name.value match {
      case "cropper" | "image-loader" =>
        Seq("cmyk.icc", "grayscale.icc", "srgb.icc").map { file =>
          baseDirectory.value / file -> s"packages/${magentaPackageName.value}/$file"
        }
      case _ => Seq()
    })),

    playArtifactFile := "artifacts.zip",
    playArtifact := {
      val distFile = target.value / playArtifactFile.value
      streams.value.log.info("Disting " + distFile)

      if (distFile.exists()) {
        distFile.delete()
      }
      IO.zip(playArtifactResources.value, distFile)

      streams.value.log.info("Done disting.")
      distFile
    }
  )
}
