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
    "github:angular/bower-angular-route": "github:angular/bower-angular-route@1.2.23"
  }
});

System.config({
  "versions": {
    "github:angular/bower-angular": "1.2.23",
    "github:angular/bower-angular-route": "1.2.23"
  }
});

