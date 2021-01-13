package com.gu.mediaservice.lib.config

import com.typesafe.config.ConfigException.BadValue
import com.typesafe.config.ConfigFactory
import org.scalatest.Inside.inside
import org.scalatest.{EitherValues, FreeSpec, Matchers}
import play.api.{ConfigLoader, Configuration}

trait TestProvider {
  def info: String
}

case class TestProviderResources(aResource: String)

object ObjectTestProvider extends TestProvider {
  override def info: String = "object-test-provider"
}

class NoArgTestProvider extends TestProvider {
  override def info: String = "no-arg-test-provider"
}

case class ResourceTestProvider(resources: TestProviderResources) extends TestProvider {
  override def info: String = s"resource-test-provider ${resources.aResource}"
}

case class ConfigTestProvider(config: Configuration) extends TestProvider {
  override def info: String = s"config-test-provider ${config.hashCode}"
}

case class ConfigResourceTestProvider(config: Configuration, resources: TestProviderResources) extends TestProvider {
  override def info: String = s"config-resource-test-provider ${config.hashCode} ${resources.aResource}"
}

case class ResourceConfigTestProvider(resources: TestProviderResources, config: Configuration) extends TestProvider {
  override def info: String = s"resource-config-test-provider ${resources.aResource} ${config.hashCode}"
}

case class BadTestProvider(resources: TestProviderResources, config: Configuration) extends TestProvider {
  throw new IllegalArgumentException("Oh dear, something went wrong")
  override def info: String = s"resource-config-test-provider ${resources.aResource} ${config.hashCode}"
}

class NotATestProvider {
  def monkey: String = "not-test-provider"
}

class TestProviderWithStringConstructor(configString: String) extends TestProvider {
  def info: String = s"not-test-provider $configString"
}

object TestProviderLoader extends ProviderLoader[TestProvider, TestProviderResources]("test provider")


class ProviderLoaderTest extends FreeSpec with Matchers with EitherValues {

  "The class reflector" - {
    val resources = TestProviderResources("sausages")
    val emptyConfig = Configuration.empty
    val providerResources = ProviderResources(emptyConfig, resources)

    "should successfully load a no arg TestProvider instance" in {
      val instance = TestProviderLoader.loadProvider(classOf[NoArgTestProvider].getCanonicalName, providerResources)
      instance.right.value.info shouldBe "no-arg-test-provider"
    }

    "should successfully load a companion object TestProvider" in {
      val instance = TestProviderLoader.loadProvider(ObjectTestProvider.getClass.getCanonicalName, providerResources)
      instance.right.value.info shouldBe s"object-test-provider"
    }

    "should successfully load a config arg TestProvider instance" in {
      val instance = TestProviderLoader.loadProvider(classOf[ConfigTestProvider].getCanonicalName, providerResources)
      instance.right.value.info shouldBe s"config-test-provider ${emptyConfig.hashCode}"
    }

    "should successfully load a resource arg TestProvider instance" in {
      val instance = TestProviderLoader.loadProvider(classOf[ResourceTestProvider].getCanonicalName, providerResources)
      instance.right.value.info shouldBe s"resource-test-provider sausages"
    }

    "should successfully load a config, resource arg TestProvider instance" in {
      val instance = TestProviderLoader.loadProvider(classOf[ConfigResourceTestProvider].getCanonicalName, providerResources)
      instance.right.value.info shouldBe s"config-resource-test-provider ${emptyConfig.hashCode} sausages"
    }

    "should successfully load a resource, config arg TestProvider instance" in {
      val instance = TestProviderLoader.loadProvider(classOf[ResourceConfigTestProvider].getCanonicalName, providerResources)
      instance.right.value.info shouldBe s"resource-config-test-provider sausages ${emptyConfig.hashCode}"
    }

    "should fail to load something that isn't an TestProvider" in {
      val instance = TestProviderLoader.loadProvider(classOf[NotATestProvider].getCanonicalName, providerResources)
      instance.left.value shouldBe "Failed to cast com.gu.mediaservice.lib.config.NotATestProvider to a com.gu.mediaservice.lib.config.TestProvider"
    }

    "should fail to load something that doesn't have a suitable constructor" in {
      val instance = TestProviderLoader.loadProvider(classOf[TestProviderWithStringConstructor].getCanonicalName, providerResources)
      instance.left.value shouldBe """A provider must have one and only one valid constructors taking arguments of type
                                     |com.gu.mediaservice.lib.config.TestProviderResources or play.api.Configuration.
                                     |com.gu.mediaservice.lib.config.TestProviderWithStringConstructor has 0 constructors:
                                     |List()""".stripMargin
    }

    "should fail to load something that doesn't exist" in {
      val instance = TestProviderLoader.loadProvider("com.gu.mediaservice.lib.config.TestProviderThatDoesntExist", providerResources)
      instance.left.value shouldBe "Unable to find test provider class com.gu.mediaservice.lib.config.TestProviderThatDoesntExist"
    }

    val nonEmptyConfig = Configuration.from(Map("key" -> "value"))
    val nonEmptyConfigProviderResources = ProviderResources(nonEmptyConfig, resources)

    "should fail to load a no arg processor that doesn't take configuration with non-empty configuration" in {
      val instance = TestProviderLoader.loadProvider(classOf[NoArgTestProvider].getCanonicalName, nonEmptyConfigProviderResources)
      instance.left.value shouldBe "Configuration provided but constructor of com.gu.mediaservice.lib.config.NoArgTestProvider with args () doesn't take it."
    }

    "should fail to load an object processor that doesn't take configuration with non-empty configuration" in {
      val instance = TestProviderLoader.loadProvider(ObjectTestProvider.getClass.getCanonicalName, nonEmptyConfigProviderResources)
      instance.left.value shouldBe "Configuration provided but com.gu.mediaservice.lib.config.ObjectTestProvider$ is a companion object and doesn't take configuration."
    }

    "should fail to load a provider if the constructor throws an exception" in {
      val instance = TestProviderLoader.loadProvider(classOf[BadTestProvider].getCanonicalName, providerResources)
      instance.left.value shouldBe "java.lang.IllegalArgumentException thrown when executing constructor java.lang.reflect.Constructor(com.gu.mediaservice.lib.config.TestProviderResources, play.api.Configuration). Search logs for stack trace."
    }
  }

  "The config loader" - {
    val resources = TestProviderResources("sausages")

    implicit val testProviderConfigLoader: ConfigLoader[TestProvider] = TestProviderLoader.singletonConfigLoader(resources)
    implicit val testProvidersConfigLoader: ConfigLoader[Seq[TestProvider]] = TestProviderLoader.seqConfigLoader(resources)

    "should load an image processor from a classname" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          "com.gu.mediaservice.lib.config.NoArgTestProvider"
        )
      ))

      val processors = conf.get[Seq[TestProvider]]("some.path")
      processors.head shouldBe a[NoArgTestProvider]
    }

    "should load an image processor which has configuration" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          Map(
            "className" -> "com.gu.mediaservice.lib.config.ConfigTestProvider",
            "config" -> Map("parameter" -> "value")
          )
        )
      ))
      val processors = conf.get[Seq[TestProvider]]("some.path")
      val processor = processors.head
      inside(processor) {
        case ConfigTestProvider(config) => config.get[String]("parameter") shouldBe "value"
      }
    }

    "should load multiple image processors of mixed config types" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          "com.gu.mediaservice.lib.config.NoArgTestProvider",
          Map(
            "className" -> "com.gu.mediaservice.lib.config.ConfigTestProvider",
            "config" -> Map("parameter" -> "value")
          )
        )
      ))
      val processors = conf.get[Seq[TestProvider]]("some.path")
      processors.length shouldBe 2
      processors.toList should matchPattern {
        case (_:NoArgTestProvider) :: ConfigTestProvider(_) :: Nil =>
      }
    }

    "should load multiple image processors of mixed config types from HOCON" in {
      val conf:Configuration = Configuration(ConfigFactory.parseString(
        """
          |some.path: [
          |  com.gu.mediaservice.lib.config.NoArgTestProvider,
          |  {
          |    className: com.gu.mediaservice.lib.config.ConfigTestProvider
          |    config: {
          |      parameter: value
          |    }
          |  }
          |]
          |""".stripMargin))
      val processors = conf.get[Seq[TestProvider]]("some.path")
      processors.length shouldBe 2
      processors.toList should matchPattern {
        case (_:NoArgTestProvider) :: ConfigTestProvider(_) :: Nil =>
      }
    }

    "should fail to load multiple image processors if they don't meet the spec" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          "com.gu.mediaservice.lib.config.NoArgTestProvider",
          Map(
            "noClassName" -> "com.gu.mediaservice.lib.config.ConfigTestProvider",
            "config" -> Map("parameter" -> "value")
          )
        )
      ))
      val thrown = the[BadValue] thrownBy {
        conf.get[Seq[TestProvider]]("some.path")
      }
      thrown.getMessage should include ("A test provider can either be a class name (string) or object with className (string) and config (object) fields. This OBJECT is not valid.")
    }

    "should fail to load an image processors if the config isn't a string" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          List("fred")
        )
      ))
      val thrown = the[BadValue] thrownBy {
        conf.get[Seq[TestProvider]]("some.path")
      }
      thrown.getMessage should include ("A test provider can either be a class name (string) or object with className (string) and config (object) fields. This LIST is not valid")
    }


  }
}
