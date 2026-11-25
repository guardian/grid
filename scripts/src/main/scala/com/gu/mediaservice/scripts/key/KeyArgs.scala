package com.gu.mediaservice.scripts.key

import com.gu.mediaservice.auth.Permissions
import com.gu.mediaservice.lib.auth.{Developer, Machine, PrincipalType, Expiry, Day, Week, Month}
import com.gu.permissions.PermissionDefinition

case class KeyArgs(
                    name: String,
                    principalType: PrincipalType,
                    permissions: Seq[PermissionDefinition],
                    expiry: Option[Expiry]
                  )

object KeyArgs {

  private val usage: String = {
    val perms = Permissions.all.map(p => s"    - ${p.name}").mkString("\n")
    s"""Usage: CreateKeyV2 --name=<name> [--type=developer|machine] [--permissions=<csv>]
       |
       |Options:
       |  --name=<name>         Name for the key (required)
       |  --type=<type>         'developer' (default) or 'machine'
       |  --permissions=<csv>   Comma-separated list. Defaults to none.
       |  --expiry=<days>       'day', 'week', or 'month' (default is 'day' for developer keys, no expiry for machine keys)
       |  --help                Show this message
       |
       |Available permissions:
       |$perms
       |""".stripMargin
  }

  /** Lookup of permission by its name, case-insensitive. */
  private val permissionsByName: Map[String, PermissionDefinition] =
    Permissions.all.map(p => p.name.toLowerCase -> p).toMap

  private def fail(message: String): Nothing = {
    System.err.println(s"Error: $message\n")
    System.err.println(usage)
    sys.exit(1)
  }

  def parse(args: Array[String]): KeyArgs = {
    if (args.contains("--help")) {
      println(usage)
      sys.exit(0)
    }

    val options: Map[String, String] = args.foldLeft(Map.empty[String, String]) {
      case (acc, arg) if arg.startsWith("--") && arg.contains("=") =>
        val (key, value) = arg.stripPrefix("--").span(_ != '=')
        acc + (key -> value.stripPrefix("="))
      case (_, arg) =>
        fail(s"unrecognised argument '$arg' (expected --key=value)")
    }

    val name = options.getOrElse("name", fail("--name is required"))

    val principalType = options.get("type").map(_.toLowerCase) match {
      case None | Some("developer") => Developer
      case Some("machine")          => Machine
      case Some(other)              => fail(s"unknown --type '$other' (expected 'developer' or 'machine')")
    }

    val permissions = options.get("permissions") match {
      case None | Some("")   => Nil
      case Some(csv) =>
        val requested = csv.split(",").map(_.trim).filter(_.nonEmpty).toSeq
        val (known, unknown) = requested.partition(p => permissionsByName.contains(p.toLowerCase))
        if (unknown.nonEmpty) {
          fail(s"unknown permission(s): ${unknown.mkString(", ")}. " +
            s"Valid values: ${Permissions.all.map(_.name).mkString(", ")}")
        }
        known.map(p => permissionsByName(p.toLowerCase)).distinct
    }
    val expiryDays = options.get("expiry") match {
      case None => None
      case Some("day") => Some(Day)
      case Some("week") => Some(Week)
      case Some("month") => Some(Month)
      case Some(other) => fail(s"unknown --expiry '$other' (expected 'day', 'week', or 'month')")    }

    KeyArgs(name, principalType, permissions, expiryDays)
  }
}
