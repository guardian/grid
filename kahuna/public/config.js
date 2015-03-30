System.config({
  "paths": {
    "*": "*.js",
    "app/*": "lib/*.js",
    "github:*": "jspm_packages/github/*.js",
    "npm:*": "jspm_packages/npm/*.js"
  },
  "bundles": {
    "js/dist/build": [
      "github:angular/bower-angular@1.3.15/angular",
      "github:angular-ui/ui-router@0.2.13/angular-ui-router",
      "npm:panda-session@0.1.4/src/session",
      "npm:theseus@0.3.1/theseus/util",
      "npm:theseus@0.3.1/theseus/util/asserts",
      "npm:uri-templates@0.1.5/uri-templates",
      "npm:any-http-angular@0.1.0/any-http-angular",
      "npm:any-promise-angular@0.1.1/any-promise-angular",
      "js/services/api/media-cropper",
      "js/services/api/loader",
      "js/services/api/edits-api",
      "github:components/jquery@2.1.1/jquery",
      "github:systemjs/plugin-css@0.1.0/css",
      "js/directives",
      "js/crop/controller",
      "js/crop/view.html!github:systemjs/plugin-text@0.0.2",
      "js/image/controller",
      "js/search/query-filter",
      "js/imgops/service",
      "js/image/view.html!github:systemjs/plugin-text@0.0.2",
      "js/image/404.html!github:systemjs/plugin-text@0.0.2",
      "js/edits/image-editor.html!github:systemjs/plugin-text@0.0.2",
      "js/upload/file-uploader.html!github:systemjs/plugin-text@0.0.2",
      "js/upload/manager",
      "js/upload/dnd-uploader.html!github:systemjs/plugin-text@0.0.2",
      "js/upload/jobs/upload-jobs.html!github:systemjs/plugin-text@0.0.2",
      "js/preview/image.html!github:systemjs/plugin-text@0.0.2",
      "js/assets/location",
      "js/upload/jobs/required-metadata-editor.html!github:systemjs/plugin-text@0.0.2",
      "js/forms/datalist.html!github:systemjs/plugin-text@0.0.2",
      "js/upload/view.html!github:systemjs/plugin-text@0.0.2",
      "github:christopherthielen/ui-router-extras@0.0.13/release/ct-ui-router-extras",
      "github:angular/bower-angular-animate@1.3.15/angular-animate",
      "github:moment/moment@2.9.0/moment",
      "js/util/eq",
      "js/search/query.html!github:systemjs/plugin-text@0.0.2",
      "js/search/results",
      "js/search/view.html!github:systemjs/plugin-text@0.0.2",
      "js/search/results.html!github:systemjs/plugin-text@0.0.2",
      "js/edits/archiver.html!github:systemjs/plugin-text@0.0.2",
      "js/edits/labeller.html!github:systemjs/plugin-text@0.0.2",
      "js/edits/labeller-compact.html!github:systemjs/plugin-text@0.0.2",
      "js/util/async",
      "js/util/digest",
      "github:mixpanel/mixpanel-js@2.4.2/mixpanel",
      "npm:ua-parser-js@0.7.3/src/ua-parser",
      "github:getsentry/raven-js@1.1.18/dist/raven.min",
      "js/common/user-actions.html!github:systemjs/plugin-text@0.0.2",
      "js/common/track-image-loadtime",
      "js/errors/global.html!github:systemjs/plugin-text@0.0.2",
      "github:angular/bower-angular-messages@1.3.15/angular-messages",
      "js/errors/codes",
      "github:angular/bower-angular@1.3.15",
      "github:angular-ui/ui-router@0.2.13",
      "npm:panda-session@0.1.4",
      "npm:theseus@0.3.1/theseus/extractor",
      "npm:uri-templates@0.1.5",
      "npm:any-http-angular@0.1.0",
      "npm:any-promise-angular@0.1.1",
      "github:components/jquery@2.1.1",
      "github:systemjs/plugin-css@0.1.0",
      "js/crop/index",
      "js/image/index",
      "js/edits/image-editor",
      "js/upload/file-uploader",
      "js/upload/dnd-uploader",
      "js/preview/image",
      "js/forms/datalist",
      "github:christopherthielen/ui-router-extras@0.0.13",
      "github:angular/bower-angular-animate@1.3.15",
      "github:moment/moment@2.9.0",
      "js/edits/archiver",
      "js/edits/labeller",
      "js/mixpanel/snippet",
      "npm:ua-parser-js@0.7.3",
      "github:getsentry/raven-js@1.1.18",
      "js/common/user-actions",
      "github:angular/bower-angular-messages@1.3.15/index",
      "npm:pandular@0.1.5/src/session",
      "npm:theseus@0.3.1/theseus/resource",
      "js/upload/controller",
      "js/upload/jobs/upload-jobs",
      "js/upload/jobs/required-metadata-editor",
      "js/search/query",
      "js/edits/index",
      "js/mixpanel/mixpanel",
      "js/sentry/sentry",
      "js/common/index",
      "github:angular/bower-angular-messages@1.3.15",
      "npm:pandular@0.1.5/src/heal",
      "npm:theseus@0.3.1/theseus/client",
      "github:tapmodo/Jcrop@0.9.12/js/jquery.Jcrop",
      "js/upload/index",
      "js/search/index",
      "js/analytics/track",
      "js/errors/global",
      "npm:pandular@0.1.5",
      "npm:theseus@0.3.1/theseus",
      "github:tapmodo/Jcrop@0.9.12",
      "npm:theseus@0.3.1",
      "js/directives/ui-crop-box",
      "npm:theseus-angular@0.2.3/theseus-angular",
      "npm:theseus-angular@0.2.3",
      "js/services/api",
      "js/services/api/media-api",
      "js/main"
    ]
  }
});

System.config({
  "map": {
    "angular": "github:angular/bower-angular@1.3.15",
    "angular-animate": "github:angular/bower-angular-animate@1.3.15",
    "angular-messages": "github:angular/bower-angular-messages@1.3.15",
    "angular-ui-router": "github:angular-ui/ui-router@0.2.13",
    "angular-ui-router-extras": "github:christopherthielen/ui-router-extras@0.0.13",
    "css": "github:systemjs/plugin-css@0.1.0",
    "github:tapmodo/Jcrop": "github:tapmodo/Jcrop@0.9.12",
    "jcrop": "github:tapmodo/Jcrop@0.9.12",
    "jquery": "github:components/jquery@2.1.1",
    "mixpanel-js": "github:mixpanel/mixpanel-js@2.4.2",
    "moment": "github:moment/moment@2.9.0",
    "pandular": "npm:pandular@0.1.5",
    "raven-js": "github:getsentry/raven-js@1.1.18",
    "text": "github:systemjs/plugin-text@0.0.2",
    "theseus": "npm:theseus@0.3.1",
    "theseus-angular": "npm:theseus-angular@0.2.3",
    "ua-parser-js": "npm:ua-parser-js@0.7.3",
    "github:angular-ui/ui-router@0.2.13": {
      "angular": "github:angular/bower-angular@1.3.15"
    },
    "github:angular/bower-angular-animate@1.3.15": {
      "angular": "github:angular/bower-angular@1.3.15"
    },
    "github:jspm/nodelibs-path@0.1.0": {
      "path-browserify": "npm:path-browserify@0.0.0"
    },
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "github:jspm/nodelibs-util@0.1.0": {
      "util": "npm:util@0.10.3"
    },
    "github:tapmodo/Jcrop@0.9.12": {
      "css": "github:systemjs/plugin-css@0.1.0",
      "jquery": "github:components/jquery@2.1.1"
    },
    "npm:any-http-angular@0.1.0": {
      "angular": "github:angular/bower-angular@1.3.15"
    },
    "npm:any-promise-angular@0.1.1": {
      "angular": "github:angular/bower-angular@1.3.15"
    },
    "npm:inherits@2.0.1": {
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:pandular@0.1.5": {
      "angular": "github:angular/bower-angular@1.3.15",
      "panda-session": "npm:panda-session@0.1.4"
    },
    "npm:path-browserify@0.0.0": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:theseus-angular@0.2.3": {
      "angular": "github:angular/bower-angular@1.3.15",
      "any-http-angular": "npm:any-http-angular@0.1.0",
      "any-promise-angular": "npm:any-promise-angular@0.1.1",
      "theseus": "npm:theseus@0.3.1"
    },
    "npm:theseus@0.3.1": {
      "uri-templates": "npm:uri-templates@0.1.5"
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
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});

