addSbtPlugin("org.playframework" % "sbt-plugin" % "3.0.5")

addSbtPlugin("com.eed3si9n" % "sbt-buildinfo" % "0.9.0")

addSbtPlugin("com.typesafe.sbt" % "sbt-digest" % "1.1.4")

addSbtPlugin("com.typesafe.sbt" % "sbt-gzip" % "1.0.2")

/*
   Without setting VersionScheme.Always here on `scala-xml`, sbt 1.8.0 will raise fatal 'version conflict' errors when
   used with sbt plugins like `sbt-native-packager`, which currently use sort-of-incompatible versions of the `scala-xml`
   library. sbt 1.8.0 has upgraded to Scala 2.12.17, which has itself upgraded to `scala-xml` 2.1.0
   (see https://github.com/sbt/sbt/releases/tag/v1.8.0), but `sbt-native-packager` is currently using `scala-xml` 1.1.1,
    and the `scala-xml` library declares that it uses specifically 'early-semver' version compatibility (see
    https://www.scala-lang.org/blog/2021/02/16/preventing-version-conflicts-with-versionscheme.html#versionscheme-librarydependencyschemes-and-sbt-150 ),
    meaning that for version x.y.z, `x` & `y` *must match exactly* for versions to be considered compatible by sbt.
    By setting VersionScheme.Always here on `scala-xml`, we're overriding its declared version-compatability scheme,
    choosing to tolerate the risk of binary incompatibility. We consider this to be safe because when set under
    `projects/` (ie *not* in `build.sbt` itself) it only affects the compilation of build.sbt, not of the application
    build itself. Once the build has succeeded, there is no further risk (ie of a runtime exception due to clashing
    versions of `scala-xml`).
 */
libraryDependencySchemes += "org.scala-lang.modules" %% "scala-xml" % VersionScheme.Always
