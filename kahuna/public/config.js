System.config({
  "paths": {
    "*": "assets/js/*.js",
    "npm:*": "assets/jspm_packages/npm/*.js",
    "github:*": "assets/jspm_packages/github/*.js"
  }
});

// TODO: Setup package with main
// TODO: submit this to jspm registry
System.meta["github:angular/bower-angular-route@1.2.23/angular-route"] = {
  "deps": ["angular"]
};

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

