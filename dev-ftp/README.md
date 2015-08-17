# Development FTP server

Simple local FTP server to help test the `ftp-watcher` service in
development.

To use this development FTP server, register an API key for your local
server and add it to your `/etc/gu/ftp-watcher.properties` file (you
can use the dot-properties helper script and configure its `ftp.key`).

Install the necessary dependencies:

```
$ gem install ftpd
```

Then start the development server:

```
$ ruby run.rb
```

You should then be able to start the `ftp-watcher` service and have it
connect to your local FTP server.

To add files to it, just connect to the server via FTP, create
a directory to import (e.g. `getty`) and put files in it:

```
$ ftp localhost 41756
# use 'any' as username and password
ftp> mkdir getty
ftp> cd getty
ftp> put local-file.jpg .
```
