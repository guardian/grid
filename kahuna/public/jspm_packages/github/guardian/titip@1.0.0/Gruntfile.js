/*!
 * QuantumUI's Gruntfile
 * http://angularui.net
 * Copyright 2014-2015 Mehmet Ötkün, AngularUI.
 */

module.exports = function (grunt) {
    'use strict';

    // Force use of Unix newlines
    grunt.util.linefeed = '\n';

    grunt.initConfig({

        // Metadata.
        pkg: grunt.file.readJSON('package.json'),
        bower_conf: grunt.file.exists('.bowerrc') ? grunt.file.readJSON('.bowerrc') : { directory: 'bower_components' },
        banner: '/*!\n' +
                ' * AngularUIUI Free v<%= pkg.version %> (<%= pkg.homepage %>)\n' +
                ' * Copyright 2014-<%= grunt.template.today("yyyy") %> <%= pkg.author %>\n' +
                ' */\n',

        // Task configuration.
        clean: {
            dist: ['dist']
        },

        less: {
            compileCore: {
                options: {
                    strictMath: true,
                    sourceMap: true,
                    outputSourceFiles: true,
                    sourceMapURL: '<%= pkg.name %>.css.map',
                    sourceMapFilename: 'dist/css/<%= pkg.name %>.css.map'
                },
                files: {
                    'dist/css/<%= pkg.name %>.css': 'less/<%= pkg.name %>.less'
                }
            }
        },

        autoprefixer: {
            options: {
                browsers: [
                  'Android >= 4',
                  'Chrome >= 20',
                  'Firefox >= 24', // Firefox 24 is the latest ESR
                  'Explorer >= 9',
                  'iOS >= 6',
                  'Opera >= 16',
                  'Safari >= 6'
                ]
            },
            core: {
                options: {
                    map: true
                },
                src: 'dist/css/<%= pkg.name %>.css'
            },
            assets: {
                //src: ['docs/assets/css/docs.css', 'docs/assets/css/demo.css']
            }
        },

        csslint: {
            options: {
                csslintrc: 'less/.csslintrc',
                'overqualified-elements': false
            },
            src: [
              'dist/css/<%= pkg.name %>.css'
            ]
        },

        cssmin: {
            options: {
                keepSpecialComments: '*',
                noAdvanced: true
            },
            core: {
                files: {
                    'dist/css/<%= pkg.name %>.min.css': 'dist/css/<%= pkg.name %>.css'
                }
            }
        },

        usebanner: {
            dist: {
                options: {
                    position: 'top',
                    banner: '<%= banner %>'
                },
                files: {
                    src: [
                      'dist/css/<%= pkg.name %>.css',
                      'dist/css/<%= pkg.name %>.min.css'
                    ]
                }
            }
        },

        csscomb: {
            options: {
                config: 'less/.csscomb.json'
            },
            dist: {
                files: {
                    'dist/css/<%= pkg.name %>.css': 'dist/css/<%= pkg.name %>.css'
                }
            },
            assets: {
                //files: {
                //    'docs/assets/css/docs.css': 'docs/assets/css/docs.css',
                //    'docs/assets/css/demo.css': 'docs/assets/css/demo.css'
                //}
            }
        },

        copy: {
            dist: {
                expand: true,
                flatten: true,
                cwd: './styles',
                src: [
                  'effect-light.min.css'
                ],
                dest: 'dist/css/addon/'
            }
        },

        connect: {
            options: {
                port: 9093,
                livereload: 37933,
                hostname: 'localhost',
                base: '.'
            },
            livereload: {
                options: {
                    open: true
                }
            }
        },
        watch: {
            less: {
                files: 'less/**/*.less',
                tasks: ['less', 'autoprefixer']
            },
            livereload: {
                options: {
                    livereload: '<%= connect.options.livereload %>'
                },
                files: ['{,*/}*.html', '{dist}/**/css/{,*/}*.css']
            }
        }
    });

    // These plugins provide necessary tasks.
    require('load-grunt-tasks')(grunt, { scope: 'devDependencies' });
    require('time-grunt')(grunt);

    // Test task.
    grunt.registerTask('test', ['csslint']);

    grunt.registerTask('dist', function (target) {
        if (target === 'css') {
            // CSS distribution task.
            return grunt.task.run(['less', 'autoprefixer', 'usebanner', 'csscomb', 'cssmin']);
        }

        if (target === 'copy') {
            // Copy files to dist.
            return grunt.task.run(['copy:dist']);
        }
        // Full distribution task.
        grunt.task.run(['clean', 'dist:css', 'dist:copy']);
    });


    // Default task.
    grunt.registerTask('default', ['test', 'dist']);

    // Run server, run...
    grunt.registerTask('server', ['less', 'autoprefixer', 'connect:livereload', 'watch']);
};