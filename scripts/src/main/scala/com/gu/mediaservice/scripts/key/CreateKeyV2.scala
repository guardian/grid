package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.auth.Permissions
import com.gu.mediaservice.lib.auth._


object CreateKeyV2 extends App {

  val s3Bucket = sys.env.getOrElse("API_KEY_BUCKET", throw new RuntimeException("API_KEY_BUCKET environment variable not set"))

  val s3Client = new S3(s3Bucket)
  val principalType = args.collectFirst { case s if s.startsWith("--type=") => s.stripPrefix("--type=") }.getOrElse("developer") match {
    case "developer" => Developer
    case "machine" => Machine
  }

  val permissions = args.collectFirst { case s if s.startsWith("--permissions=") => s.stripPrefix("--permissions=").split(",").toList }.getOrElse(Nil)

  val permissionDefinitions = permissions.flatMap(p => Permissions.all.find(_.name == p))

  val name = args.collectFirst { case s if s.startsWith("--name=") => s.stripPrefix("--name=") }.getOrElse("test-key")

  val apiKeyConfig = ApiKeyConfig(name, permissionDefinitions, principalType)

  val key = KeyGenerator.randomKey()

  s3Client.upload(key, apiKeyConfig)

}
