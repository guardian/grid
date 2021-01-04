package scala.lib

import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.config.ImageProcessorLoader
import com.gu.mediaservice.model.Image
import com.typesafe.config.ConfigException.BadValue
import com.typesafe.config.ConfigFactory
import org.joda.time.DateTime
import org.scalatest.Inside.inside
import org.scalatest.{EitherValues, FreeSpec, Matchers}
import play.api.Configuration

object ObjectImageProcessor extends ImageProcessor {
  override def apply(image: Image): Image = image.copy(id = "object-image-processed")
}

class NoArgImageProcessor extends ImageProcessor {
  override def apply(image: Image): Image = image.copy(id = "no-arg-image-processed")
}

case class ConfigImageProcessor(config: Configuration) extends ImageProcessor {
  override def apply(image: Image): Image = image.copy(id = s"config-image-processed ${config.hashCode}")
}

class NotAnImageProcessor {
  def apply(image: Image): Image = image.copy(id = "not-image-processed")
}

class ImageProcessorWithStringConstructor(configString: String) extends ImageProcessor {
  def apply(image: Image): Image = image.copy(id = "not-image-processed")
}

class ImageProcessorLoaderTest extends FreeSpec with Matchers with EitherValues {
  val testImage: Image = Image("image", DateTime.now(), "Test", None, Map.empty, null, null, null, null, null, null, null, null, null, null)
  val testConfig: Configuration = Configuration.empty
  val testNonEmptyConfig: Configuration = Configuration.from(Map("someConfig" -> "my value"))

  implicit val imageProcessorsConfigLoader = ImageProcessorLoader.imageProcessorsConfigLoader(testConfig)
  implicit val imageProcessorConfigLoader = ImageProcessorLoader.imageProcessorConfigLoader(testConfig)

  "The class reflector" - {
    "should successfully load a no arg ImageProcessor instance" in {
      val instance = ImageProcessorLoader.loadImageProcessor(classOf[NoArgImageProcessor].getCanonicalName, testConfig)
      instance.right.value.apply(testImage).id shouldBe "no-arg-image-processed"
    }

    "should successfully load a config arg ImageProcessor instance" in {
      val instance = ImageProcessorLoader.loadImageProcessor(classOf[ConfigImageProcessor].getCanonicalName, testConfig)
      instance.right.value.apply(testImage).id shouldBe s"config-image-processed ${testConfig.hashCode}"
    }

    "should successfully load a companion object ImageProcessor" in {
      val instance = ImageProcessorLoader.loadImageProcessor(ObjectImageProcessor.getClass.getCanonicalName, testConfig)
      instance.right.value.apply(testImage).id shouldBe s"object-image-processed"
    }

    "should fail to load something that isn't an ImageProcessor" in {
      val instance = ImageProcessorLoader.loadImageProcessor(classOf[NotAnImageProcessor].getCanonicalName, testConfig)
      instance.left.value shouldBe "Failed to cast scala.lib.NotAnImageProcessor to an ImageProcessor"
    }

    "should fail to load something that doesn't have a suitable constructor" in {
      val instance = ImageProcessorLoader.loadImageProcessor(classOf[ImageProcessorWithStringConstructor].getCanonicalName, testConfig)
      instance.left.value shouldBe "Unable to find a suitable constructor for scala.lib.ImageProcessorWithStringConstructor. Must either have a no arg constructor or a constructor taking one argument of type ImageProcessorConfig."
    }

    "should fail to load something that doesn't exist" in {
      val instance = ImageProcessorLoader.loadImageProcessor("scala.lib.ImageProcessorThatDoesntExist", testConfig)
      instance.left.value shouldBe "Unable to find image processor class scala.lib.ImageProcessorThatDoesntExist"
    }
    
  }

  import ImageProcessorLoader._

  "The config loader" - {

    "should load an image processor from a classname" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          "scala.lib.NoArgImageProcessor"
        )
      ))

      val processors = conf.get[Seq[ImageProcessor]]("some.path")
      processors.head shouldBe a[NoArgImageProcessor]
    }

    "should load an image processor which has configuration" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          Map(
            "className" -> "scala.lib.ConfigImageProcessor",
            "config" -> Map("parameter" -> "value")
          )
        )
      ))
      val processors = conf.get[Seq[ImageProcessor]]("some.path")
      val processor = processors.head
      inside(processor) {
        case ConfigImageProcessor(config) => config.get[String]("parameter") shouldBe "value"
      }
    }

    "should load multiple image processors of mixed config types" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          "scala.lib.NoArgImageProcessor",
          Map(
            "className" -> "scala.lib.ConfigImageProcessor",
            "config" -> Map("parameter" -> "value")
          )
        )
      ))
      val processors = conf.get[Seq[ImageProcessor]]("some.path")
      processors.length shouldBe 2
      processors.toList should matchPattern {
        case (_:NoArgImageProcessor) :: ConfigImageProcessor(_) :: Nil =>
      }
    }

    "should load multiple image processors of mixed config types from HOCON" in {
      val conf:Configuration = Configuration(ConfigFactory.parseString(
        """
          |some.path: [
          |  scala.lib.NoArgImageProcessor,
          |  {
          |    className: scala.lib.ConfigImageProcessor
          |    config: {
          |      parameter: value
          |    }
          |  }
          |]
          |""".stripMargin))
      val processors = conf.get[Seq[ImageProcessor]]("some.path")
      processors.length shouldBe 2
      processors.toList should matchPattern {
        case (_:NoArgImageProcessor) :: ConfigImageProcessor(_) :: Nil =>
      }
    }


    "should fail to an image processors it isn't a string" in {
      val conf:Configuration = Configuration.from(Map(
        "some.path" -> List(
          List("fred")
        )
      ))
      val thrown = the[BadValue] thrownBy {
        conf.get[Seq[ImageProcessor]]("some.path")
      }
      thrown.getMessage should include ("An image processor can either a class name (string) or object with className (string) and config (object) fields. This LIST is not valid")
    }


  }
}
