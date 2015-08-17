require 'ftpd'
require 'tmpdir'

class Driver

  def initialize(temp_dir)
    @temp_dir = temp_dir
  end

  def authenticate(user, password)
    true
  end

  def file_system(user)
    Ftpd::DiskFileSystem.new(@temp_dir)
  end

end

Dir.mktmpdir do |temp_dir|
  driver = Driver.new(temp_dir)
  server = Ftpd::FtpServer.new(driver)
  server.port = 41756
  server.start
  puts "Server listening on port #{server.bound_port}"
  gets
end
