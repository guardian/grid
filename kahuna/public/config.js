System.config({
  "paths": {
    "*": "*.js",
    "npm:*": "public/jspm_packages/npm/*.js",
    "github:*": "public/jspm_packages/github/*.js"
  }
});

System.config({
  "map": {
    "angular": "github:angular/bower-angular@1.2.23",
    "angular-ui-router": "github:angular-ui/ui-router@0.2.11",
    "css": "github:systemjs/plugin-css@^0.1.0",
    "github:tapmodo/Jcrop": "github:tapmodo/Jcrop@0.9.12",
    "jcrop": "github:tapmodo/Jcrop@0.9.12",
    "jquery": "github:components/jquery@2.1.1",
    "npm:angular-ui-router": "npm:angular-ui-router@0.2.10",
    "theseus": "github:argo-rest/theseus@master",
    "github:argo-rest/theseus@master": {
      "reqwest": "github:ded/reqwest@^1.1.2",
      "npm:uri-templates": "npm:uri-templates@^0.1.5",
      "jquery": "github:components/jquery@^2.1.1",
      "uri-templates": "npm:uri-templates@^0.1.5"
    },
    "github:jspm/nodelibs@0.0.2": {
      "inherits": "npm:inherits@^2.0.1",
      "base64-js": "npm:base64-js@^0.0.4",
      "Base64": "npm:Base64@0.2",
      "json": "github:systemjs/plugin-json@master",
      "ieee754": "npm:ieee754@^1.1.1"
    },
    "github:jspm/nodelibs@0.0.5": {
      "Base64": "npm:Base64@^0.2.0",
      "base64-js": "npm:base64-js@^0.0.4",
      "ieee754": "npm:ieee754@^1.1.1",
      "inherits": "npm:inherits@^2.0.1",
      "json": "github:systemjs/plugin-json@master",
      "pbkdf2-compat": "npm:pbkdf2-compat@^2.0.1",
      "ripemd160": "npm:ripemd160@^0.2.0",
      "sha.js": "npm:sha.js@^2.2.6"
    },
    "npm:Base64@0.2.1": {},
    "npm:angular-ui-router@0.2.10": {},
    "npm:base64-js@0.0.4": {},
    "npm:ieee754@1.1.3": {},
    "npm:inherits@2.0.1": {},
    "npm:json@9.0.2": {},
    "npm:pbkdf2-compat@2.0.1": {},
    "npm:ripemd160@0.2.0": {},
    "npm:sha.js@2.2.6": {
      "json": "npm:json@^9.0.2"
    },
    "npm:uri-templates@0.1.5": {
      "json": "github:systemjs/plugin-json@master"
    }
  }
});

System.config({
  "versions": {
    "github:angular-ui/ui-router": "0.2.11",
    "github:angular/bower-angular": "1.2.23",
    "github:argo-rest/theseus": "master",
    "github:components/jquery": "2.1.1",
    "github:ded/reqwest": "1.1.2",
    "github:jspm/nodelibs": "0.0.5",
    "github:systemjs/plugin-css": "0.1.0",
    "github:systemjs/plugin-json": "master",
    "github:tapmodo/Jcrop": "0.9.12",
    "npm:Base64": "0.2.1",
    "npm:angular-ui-router": "0.2.10",
    "npm:base64-js": "0.0.4",
    "npm:ieee754": "1.1.3",
    "npm:inherits": "2.0.1",
    "npm:json": "9.0.2",
    "npm:pbkdf2-compat": "2.0.1",
    "npm:ripemd160": "0.2.0",
    "npm:sha.js": "2.2.6",
    "npm:uri-templates": "0.1.5"
  }
});

