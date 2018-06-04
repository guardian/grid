/* */ 
module.exports = function (grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    meta: {
      banner:
        '/*'+
        'Copyright (c) Microsoft Open Technologies, Inc.  All rights reserved.\r\n' +
        'Microsoft Open Technologies would like to thank its contributors, a list.\r\n' +
        'of whom are at http://aspnetwebstack.codeplex.com/wikipage?title=Contributors..\r\n' +
        'Licensed under the Apache License, Version 2.0 (the "License"); you.\r\n' +
        'may not use this file except in compliance with the License. You may.\r\n' +
        'obtain a copy of the License at.\r\n\r\n' +
        'http://www.apache.org/licenses/LICENSE-2.0.\r\n\r\n' +
        'Unless required by applicable law or agreed to in writing, software.\r\n' +
        'distributed under the License is distributed on an "AS IS" BASIS,.\r\n' +
        'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or.\r\n' +
        'implied. See the License for the specific language governing permissions.\r\n' +
        'and limitations under the License..\r\n' +
        '*/'
    },
    concat: {
      basic: {
        src: [
          'src/license.js',
          'src/intro.js',
          'src/basicheader.js',
          'src/module.js',
          'src/factory.js',
          'src/observeonscope.js',
          'src/safeApply.js',
          'src/$rootScopeExtensions.js',
          'src/observableRuntimeExtensions.js',
          'src/scopescheduler.js',
          'src/manageScope.js',
          'src/outro.js'
        ],
        dest: 'dist/rx.angular.js'
      }
    },
    uglify: {
      options: {
        banner:
          '/* Copyright (c) Microsoft Open Technologies, Inc. All rights reserved. See License.txt in the project root for license information.*/'
      },
      basic: {
        options: {
          sourceMap: true,
          sourceMapName: 'dist/rx.angular.map'
        },
        files: {'dist/rx.angular.min.js': ['dist/rx.angular.js'] }
      }
    },
    qunit: {
      all: ['tests/*.html']
    }
  });

  require('load-grunt-tasks')(grunt);


  grunt.registerTask('nuget', 'Register NuGet-RxJS-Angular', function () {
    var done = this.async();

    //invoke nuget.exe
    grunt.util.spawn({
      cmd: ".nuget/nuget.exe",
      args: [
        //specify the .nuspec file
        "pack",
        "nuget/RxJS-Bridges-Angular/RxJS-Bridges-Angular.nuspec",

        //specify where we want the package to be created
        "-OutputDirectory",
        "nuget",

        //override the version with whatever is currently defined in package.json
        "-Version",
        grunt.config.get("pkg").version
      ]
    }, function (error, result) {
      if (error) {
        grunt.log.error(error);
      } else {
        grunt.log.write(result);
      }

      done();
    });
  });

  // Default task(s).
  grunt.registerTask('default', ['concat:basic', 'uglify:basic', 'qunit']);
};
