System.config({
  "paths": {
    "*": "*.js",
    "app/*": "lib/*.js",
    "github:*": "jspm_packages/github/*.js",
    "npm:*": "jspm_packages/npm/*.js"
  }
});

System.config({
  "map": {
    "angular": "github:angular/bower-angular@1.3.5",
    "angular-ui-router": "github:angular-ui/ui-router@0.2.13",
    "css": "github:systemjs/plugin-css@0.1.0",
    "github:tapmodo/Jcrop": "github:tapmodo/Jcrop@0.9.12",
    "jcrop": "github:tapmodo/Jcrop@0.9.12",
    "jquery": "github:components/jquery@2.1.1",
    "mixpanel-js": "github:mixpanel/mixpanel-js@2.3.2",
    "pandular": "npm:pandular@0.1.2",
    "raven-js": "github:getsentry/raven-js@1.1.16",
    "text": "github:systemjs/plugin-text@0.0.2",
    "theseus": "github:argo-rest/theseus@0.1.3",
    "ua-parser-js": "npm:ua-parser-js@0.7.3",
    "github:angular-ui/ui-router@0.2.13": {
      "angular": "github:angular/bower-angular@1.3.5"
    },
    "github:argo-rest/theseus@0.1.3": {
      "jquery": "github:components/jquery@2.1.1",
      "reqwest": "github:ded/reqwest@1.1.5",
      "uri-templates": "npm:uri-templates@0.1.5"
    },
    "github:jspm/nodelibs-path@0.1.0": {
      "path-browserify": "npm:path-browserify@0.0.0"
    },
    "github:jspm/nodelibs-process@0.1.0": {
      "process": "npm:process@0.10.0"
    },
    "github:jspm/nodelibs-util@0.1.0": {
      "util": "npm:util@0.10.3"
    },
    "npm:inherits@2.0.1": {
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:pandular@0.1.2": {
      "angular": "github:angular/bower-angular@1.3.5",
      "panda-session": "npm:panda-session@0.1.3"
    },
    "npm:path-browserify@0.0.0": {
      "process": "github:jspm/nodelibs-process@0.1.0"
    },
    "npm:ua-parser-js@0.7.3": {
      "systemjs-json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:uri-templates@0.1.5": {
      "path": "github:jspm/nodelibs-path@0.1.0",
      "systemjs-json": "github:systemjs/plugin-json@0.1.0",
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:util@0.10.3": {
      "inherits": "npm:inherits@2.0.1",
      "process": "github:jspm/nodelibs-process@0.1.0"
    }
  }
});

