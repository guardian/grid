/* */ 
module.exports = function(grunt) {
  'use strict';
  var path = require('path');
  var util = require('util');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-markdown');
  grunt.loadNpmTasks('grunt-mocha');
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    copy: {test_deps: {
        expand: true,
        flatten: true,
        src: ['node_modules/mocha/mocha.js', 'node_modules/mocha/mocha.css', 'node_modules/proclaim/proclaim.js'],
        dest: 'test/deps'
      }},
    jshint: {
      options: {
        reporter: './node_modules/jshint-path-reporter',
        jshintrc: '.jshintrc'
      },
      tests: ['./test.js'],
      output: ['./uri-templates.js']
    },
    uglify: {main: {
        options: {report: 'min'},
        files: {'uri-templates.min.js': ['uri-templates.js']}
      }},
    mochaTest: {any: {
        src: ['test.js', 'test/custom-tests.js'],
        options: {
          reporter: 'mocha-unfunk-reporter',
          bail: false
        }
      }}
  });
  grunt.registerTask('default', ['test']);
  grunt.registerTask('build', ['uglify:main', 'copy']);
  grunt.registerTask('test', ['build', 'mochaTest']);
  grunt.registerTask('dev', ['clean', 'jshint', 'mochaTest']);
};
