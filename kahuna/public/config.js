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
    "npm:angular-ui-router": "npm:angular-ui-router@0.2.10",
    "npm:angular-ui-router@0.2.10": {},
    "github:jspm/nodelibs@0.0.2": {
      "inherits": "npm:inherits@^2.0.1",
      "base64-js": "npm:base64-js@^0.0.4",
      "Base64": "npm:Base64@0.2",
      "json": "github:systemjs/plugin-json@master",
      "ieee754": "npm:ieee754@^1.1.1"
    },
    "npm:inherits@2.0.1": {},
    "npm:base64-js@0.0.4": {},
    "npm:Base64@0.2.1": {},
    "npm:ieee754@1.1.3": {},
    "jquery": "github:components/jquery@2.1.1",
    "github:tapmodo/Jcrop": "github:tapmodo/Jcrop@0.9.12",
    "css": "github:systemjs/plugin-css@^0.1.0",
    "jcrop": "github:tapmodo/Jcrop@0.9.12",
    "angular-ui-router": "github:angular-ui/ui-router@0.2.11",
    "github:jspm/nodelibs@0.0.3": {
      "ieee754": "npm:ieee754@^1.1.1",
      "Base64": "npm:Base64@0.2",
      "base64-js": "npm:base64-js@0.0",
      "inherits": "npm:inherits@^2.0.1",
      "json": "github:systemjs/plugin-json@master"
    }
  }
});

System.config({
  "versions": {
    "github:angular/bower-angular": "1.2.23",
    "npm:angular-ui-router": "0.2.10",
    "github:jspm/nodelibs": "0.0.3",
    "npm:inherits": "2.0.1",
    "npm:base64-js": "0.0.4",
    "npm:Base64": "0.2.1",
    "github:systemjs/plugin-json": "master",
    "npm:ieee754": "1.1.3",
    "github:components/jquery": "2.1.1",
    "github:tapmodo/Jcrop": "0.9.12",
    "github:systemjs/plugin-css": "0.1.0",
    "github:angular-ui/ui-router": "0.2.11"
  }
});

