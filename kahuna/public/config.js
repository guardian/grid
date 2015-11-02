System.config({
  baseURL: "/assets",
  defaultJSExtensions: true,
  transpiler: "traceur",
  paths: {
    "app/*": "lib/*.js",
    "github:*": "jspm_packages/github/*",
    "npm:*": "jspm_packages/npm/*"
  },

  map: {
    "angular": "github:angular/bower-angular@1.4.3",
    "angular-animate": "github:angular/bower-angular-animate@1.4.3",
    "angular-bootstrap": "github:angular-ui/bootstrap-bower@0.13.1",
    "angular-elastic": "github:monospaced/angular-elastic@2.5.0",
    "angular-messages": "github:angular/bower-angular-messages@1.4.3",
    "angular-ui-router": "github:angular-ui/ui-router@0.2.15",
    "angular-ui-router-extras": "github:christopherthielen/ui-router-extras@0.0.14",
    "angular-xeditable": "github:vitalets/angular-xeditable@0.1.9",
    "clean-css": "npm:clean-css@3.3.6",
    "css": "github:systemjs/plugin-css@0.1.13",
    "github:tapmodo/Jcrop": "github:tapmodo/Jcrop@0.9.12",
    "immutable": "npm:immutable@3.7.5",
    "javascript-detect-element-resize": "github:sdecima/javascript-detect-element-resize@0.5.3",
    "jcrop": "github:tapmodo/Jcrop@0.9.12",
    "jquery": "github:components/jquery@2.1.1",
    "jszip": "npm:jszip@2.5.0",
    "mixpanel-js": "github:mixpanel/mixpanel-js@2.5.2",
    "moment": "github:moment/moment@2.10.5",
    "pandular": "npm:pandular@0.1.5",
    "pikaday": "github:dbushell/Pikaday@1.3.3",
    "raven-js": "github:getsentry/raven-js@1.1.19",
    "rx": "npm:rx@2.5.3",
    "rx-angular": "npm:rx-angular@0.0.14",
    "rx-dom": "npm:rx-dom@6.0.0",
    "text": "github:systemjs/plugin-text@0.0.2",
    "theseus": "npm:theseus@0.5.1",
    "theseus-angular": "npm:theseus-angular@0.3.0",
    "traceur": "github:jmcriffey/bower-traceur@0.0.92",
    "traceur-runtime": "github:jmcriffey/bower-traceur-runtime@0.0.92",
    "ua-parser-js": "npm:ua-parser-js@0.7.3",
    "uri-templates": "npm:uri-templates@0.1.5",
    "github:angular-ui/ui-router@0.2.15": {
      "angular": "github:angular/bower-angular@1.4.3"
    },
    "github:angular/bower-angular-animate@1.4.3": {
      "angular": "github:angular/bower-angular@1.4.3"
    },
    "github:christopherthielen/ui-router-extras@0.0.14": {
      "angular": "github:angular/bower-angular@1.4.3"
    },
    "github:dbushell/Pikaday@1.3.3": {
      "css": "github:systemjs/plugin-css@0.1.13"
    },
    "github:jspm/nodelibs-assert@0.1.0": {
      "assert": "npm:assert@1.3.0"
    },
    "github:jspm/nodelibs-buffer@0.1.0": {
      "buffer": "npm:buffer@3.3.1"
    },
    "github:jspm/nodelibs-events@0.1.1": {
      "events": "npm:events@1.0.2"
    },
    "github:jspm/nodelibs-http@1.7.1": {
      "Base64": "npm:Base64@0.2.1",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "inherits": "npm:inherits@2.0.1",
      "stream": "github:jspm/nodelibs-stream@0.1.0",
      "url": "github:jspm/nodelibs-url@0.1.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "github:jspm/nodelibs-https@0.1.0": {
      "https-browserify": "npm:https-browserify@0.0.0"
    },
    "github:jspm/nodelibs-os@0.1.0": {
      "os-browserify": "npm:os-browserify@0.1.2"
    },
    "github:jspm/nodelibs-path@0.1.0": {
      "path-browserify": "npm:path-browserify@0.0.0"
    },
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "github:jspm/nodelibs-stream@0.1.0": {
      "stream-browserify": "npm:stream-browserify@1.0.0"
    },
    "github:jspm/nodelibs-url@0.1.0": {
      "url": "npm:url@0.10.3"
    },
    "github:jspm/nodelibs-util@0.1.0": {
      "util": "npm:util@0.10.3"
    },
    "github:tapmodo/Jcrop@0.9.12": {
      "css": "github:systemjs/plugin-css@0.1.13",
      "jquery": "github:components/jquery@2.1.1"
    },
    "github:vitalets/angular-xeditable@0.1.9": {
      "angular": "github:angular/bower-angular@1.4.3",
      "css": "github:systemjs/plugin-css@0.1.13"
    },
    "npm:amdefine@1.0.0": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "module": "github:jspm/nodelibs-module@0.1.0",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:any-http-angular@0.1.0": {
      "angular": "github:angular/bower-angular@1.4.3"
    },
    "npm:any-promise-angular@0.1.1": {
      "angular": "github:angular/bower-angular@1.4.3"
    },
    "npm:assert@1.3.0": {
      "util": "npm:util@0.10.3"
    },
    "npm:buffer@3.3.1": {
      "base64-js": "npm:base64-js@0.0.8",
      "ieee754": "npm:ieee754@1.1.6",
      "is-array": "npm:is-array@1.0.1"
    },
    "npm:clean-css@3.3.6": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "commander": "npm:commander@2.8.1",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "http": "github:jspm/nodelibs-http@1.7.1",
      "https": "github:jspm/nodelibs-https@0.1.0",
      "os": "github:jspm/nodelibs-os@0.1.0",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.1",
      "source-map": "npm:source-map@0.4.4",
      "url": "github:jspm/nodelibs-url@0.1.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:commander@2.8.1": {
      "child_process": "github:jspm/nodelibs-child_process@0.1.0",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "graceful-readlink": "npm:graceful-readlink@1.0.1",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:core-util-is@1.0.1": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0"
    },
    "npm:graceful-readlink@1.0.1": {
      "fs": "github:jspm/nodelibs-fs@0.1.2"
    },
    "npm:https-browserify@0.0.0": {
      "http": "github:jspm/nodelibs-http@1.7.1"
    },
    "npm:inherits@2.0.1": {
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:jszip@2.5.0": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "pako": "npm:pako@0.2.7",
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:os-browserify@0.1.2": {
      "os": "github:jspm/nodelibs-os@0.1.0"
    },
    "npm:pako@0.2.7": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:pandular@0.1.5": {
      "angular": "github:angular/bower-angular@1.4.3",
      "panda-session": "npm:panda-session@0.1.5"
    },
    "npm:path-browserify@0.0.0": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:punycode@1.3.2": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:readable-stream@1.1.13": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "core-util-is": "npm:core-util-is@1.0.1",
      "events": "github:jspm/nodelibs-events@0.1.1",
      "inherits": "npm:inherits@2.0.1",
      "isarray": "npm:isarray@0.0.1",
      "process": "github:jspm/nodelibs-process@0.1.1",
      "stream-browserify": "npm:stream-browserify@1.0.0",
      "string_decoder": "npm:string_decoder@0.10.31"
    },
    "npm:rx-angular@0.0.14": {
      "rx": "npm:rx@2.5.3"
    },
    "npm:rx-dom@6.0.0": {
      "process": "github:jspm/nodelibs-process@0.1.1",
      "rx": "npm:rx@2.5.3"
    },
    "npm:rx@2.5.3": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:source-map@0.4.4": {
      "amdefine": "npm:amdefine@1.0.0",
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:stream-browserify@1.0.0": {
      "events": "github:jspm/nodelibs-events@0.1.1",
      "inherits": "npm:inherits@2.0.1",
      "readable-stream": "npm:readable-stream@1.1.13"
    },
    "npm:string_decoder@0.10.31": {
      "buffer": "github:jspm/nodelibs-buffer@0.1.0"
    },
    "npm:theseus-angular@0.3.0": {
      "angular": "github:angular/bower-angular@1.4.3",
      "any-http-angular": "npm:any-http-angular@0.1.0",
      "any-promise-angular": "npm:any-promise-angular@0.1.1",
      "theseus": "npm:theseus@0.5.0"
    },
    "npm:theseus@0.5.0": {
      "uri-templates": "npm:uri-templates@0.1.7"
    },
    "npm:theseus@0.5.1": {
      "uri-templates": "npm:uri-templates@0.1.7"
    },
    "npm:ua-parser-js@0.7.3": {
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:uri-templates@0.1.5": {
      "path": "github:jspm/nodelibs-path@0.1.0",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:uri-templates@0.1.7": {
      "path": "github:jspm/nodelibs-path@0.1.0",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:url@0.10.3": {
      "assert": "github:jspm/nodelibs-assert@0.1.0",
      "punycode": "npm:punycode@1.3.2",
      "querystring": "npm:querystring@0.2.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:util@0.10.3": {
      "inherits": "npm:inherits@2.0.1",
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});
