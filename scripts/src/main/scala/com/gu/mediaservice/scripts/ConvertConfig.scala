package com.gu.mediaservice.scripts

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths}

import com.gu.typesafe.config.{ConfigFactory, ConfigRenderOptions}

import scala.util.Try

import scala.collection.JavaConverters._

object ConvertConfig {
  case class Conversion(input: File, output: File)

  def apply(args: List[String]): Unit = {
    args match {
      case "-f" :: as => convertConfigs(as, overwrite = true)
      case as => convertConfigs(as, overwrite = false)
    }
  }

  private def convertConfigs(args: List[String], overwrite: Boolean): Unit = {
    val conversions = args.flatMap { arg =>
      val input = new File(arg)
      assert(input.exists, s"File provided for conversion doesn't exist: $input")
      val files: List[File] = if (input.isDirectory) {
        val paths: List[Path] = Files.walk(input.toPath).iterator.asScala.toIterable.toList
        val regularFiles = paths.filter(file => Files.isRegularFile(file))
        val propertiesFiles = regularFiles.filter(_.toString.endsWith(".properties"))
        val files = propertiesFiles.map(_.toFile)
        assert(files.nonEmpty, s"No properties files found to convert in $input")
        files
      } else {
        assert(input.toString.endsWith(".properties"), s"File provided for conversion isn't a java properties input: $input")
        List(input)
      }
      files.map { f =>
        val output = new File(s"${f.toString.stripSuffix(".properties")}.conf")
        if (!overwrite) {
          assert(!output.exists, s"Output file for $input already exists: $output")
        }
        Conversion(f, output)
      }
    }

    conversions.foreach(conversion => convert(conversion))
  }

  private def convert(conversion: Conversion): Either[Throwable, Unit] = {
    for {
      config <- Try(ConfigFactory.parseFile(conversion.input)).toEither
      options = ConfigRenderOptions.defaults().setOriginComments(false).setJson(false).setCompactKeys(true)
      hoconStr = config.root().render(options)
      _ <- writeToFile(conversion.output, hoconStr)
    } yield ()
  }

  private def writeToFile(file: File, str: String): Either[Throwable, Path] = {
    Try{
      System.err.println(s"Writing config to $file")
      Files.write(file.toPath, str.getBytes(StandardCharsets.UTF_8))
    }.toEither
  }
}
