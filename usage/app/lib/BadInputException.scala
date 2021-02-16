package lib

class BadInputException(message: String) extends Exception {
  override def getMessage: String = message
}
