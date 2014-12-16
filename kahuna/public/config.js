System.config({
  "paths": {
    "*": "*.js",
    "github:*": "../jspm_packages/github/*.js",
    "npm:*": "../jspm_packages/npm/*.js"
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
    "mixpanel": "github:mixpanel/mixpanel-js@2.3.2",
    "mixpanel-js": "github:mixpanel/mixpanel-js@2.3.2",
    "text": "github:systemjs/plugin-text@0.0.2",
    "theseus": "github:argo-rest/theseus@master",
    "github:angular-ui/ui-router@0.2.13": {
      "angular": "github:angular/bower-angular@1.3.5"
    },
    "github:argo-rest/theseus@master": {
      "jquery": "github:components/jquery@2.1.1",
      "reqwest": "github:ded/reqwest@1.1.5",
      "uri-templates": "npm:uri-templates@0.1.5"
    },
    "github:jspm/nodelibs@0.0.5": {
      "Base64": "npm:Base64@0.2.1",
      "base64-js": "npm:base64-js@0.0.4",
      "ieee754": "npm:ieee754@1.1.4",
      "inherits": "npm:inherits@2.0.1",
      "json": "github:systemjs/plugin-json@0.1.0",
      "pbkdf2-compat": "npm:pbkdf2-compat@2.0.1",
      "ripemd160": "npm:ripemd160@0.2.0",
      "sha.js": "npm:sha.js@2.3.0"
    },
    "github:jspm/nodelibs@0.0.7": {
      "Base64": "npm:Base64@0.2.1",
      "base64-js": "npm:base64-js@0.0.4",
      "ieee754": "npm:ieee754@1.1.4",
      "inherits": "npm:inherits@2.0.1",
      "json": "github:systemjs/plugin-json@0.1.0"
    },
    "npm:uri-templates@0.1.5": {
      "json": "npm:json@9.0.2"
    }
  }
});

