package com.gu.mediaservice.scripts

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path}

import com.gu.typesafe.config.{ConfigFactory, ConfigRenderOptions}

import scala.util.Try

object ConvertConfig {
  case class Conversion(input: File, output: File)

  def apply(args: List[String]): Unit = {
    args match {
      case "-f" :: as => convertConfigs(as, overwrite = true)
      case as => convertConfigs(as, overwrite = false)
    }
  }

  private def convertConfigs(args: List[String], overwrite: Boolean): Unit = {
    val conversions = args.map { arg =>
      val input = new File(arg)
      assert(input.exists(), s"File provided for conversion doesn't exist: $input")
      assert(input.toString.endsWith(".properties"), s"File provided for conversion isn't a java properties input: $input")
      val output = new File(s"${arg.stripSuffix(".properties")}.conf")
      if (!overwrite) {
        assert(!output.exists, s"Output file for $input already exists: $output")
      }
      Conversion(input, output)
    }

    conversions.foreach(convert)
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
