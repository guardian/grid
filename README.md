Grid
====
[![License](https://img.shields.io/github/license/guardian/grid.svg)](https://github.com/guardian/grid/blob/master/LICENSE)
[![Join the chat at https://gitter.im/guardian/grid](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/guardian/grid?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

**Grid** is [the Guardian](https://www.theguardian.com/)’s **image
management system**, which provides a **universal** and **fast**
experience accessing media that is **organised** and using it in an
**affordable** way to produce **high-quality** content.

See the [Vision](docs/00-about/01-vision.md) document for more details on the core
principles behind this project.

![Screenshot of Grid search](docs/00-about/images/screenshot-2015-07-03T11:34:43.jpg)

Grid runs as a set of independent micro-services
([Scala](http://www.scala-lang.org/) and
[Play Framework](https://playframework.com/)) exposed as hypermedia
APIs ([argo](https://github.com/argo-rest/spec)) and accessed using a
rich Web user interface ([AngularJS](https://angularjs.org/)).

Grid relies on [Elasticsearch](https://www.elastic.co/) for
blazing-fast searching, and AWS services as additional storage and
communication mechanisms.

See the [docs](./docs) for setup and running guides.
