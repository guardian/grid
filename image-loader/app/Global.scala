import java.nio.charset.Charset.defaultCharset
import play.api.{Logger, Application, GlobalSettings}

object Global extends GlobalSettings {

  override def beforeStart(app: Application) {
    Logger.info(s"Default charset is $defaultCharset")
  }

}
