import auth.AuthComponents
import lib.LogConfig
import play.api.{Application, ApplicationLoader}
import play.api.ApplicationLoader.Context

class AppLoader extends ApplicationLoader {
  override def load(context: Context): Application = {
    LogConfig.init(context)
    new AuthComponents(context).application
  }
}