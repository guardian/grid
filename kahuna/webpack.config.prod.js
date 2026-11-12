const shared = require('./webpack.config.shared');
const { merge } = require('webpack-merge');
const ImageMinimizerPlugin = require("image-minimizer-webpack-plugin");
const { sentryWebpackPlugin } = require("@sentry/webpack-plugin");

// Absent for local builds and for pull requests from forks, which cannot see repository
// secrets. Upload is skipped in that case rather than failing the build.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

// Must match the server's BuildInfo.gitCommitId, or Sentry cannot match events to these maps.
const release = process.env.BUILD_VCS_NUMBER;

if (sentryAuthToken && !(sentryOrg && sentryProject && release)) {
  // Failing loudly beats shipping a release whose stack traces are silently unsymbolicated.
  throw new Error(
    'SENTRY_AUTH_TOKEN is set but SENTRY_ORG, SENTRY_PROJECT or BUILD_VCS_NUMBER is missing, ' +
    'so source maps could not be uploaded.'
  );
}

const sentryPlugins = sentryAuthToken ? [
  sentryWebpackPlugin({
    authToken: sentryAuthToken,
    org: sentryOrg,
    project: sentryProject,
    release: { name: release },
    sourcemaps: {
      // Source maps are uploaded, then deleted before the Debian package is built, so they
      // are never served from the deployed assets.
      filesToDeleteAfterUpload: ["./public/dist/**/*.map"]
    },
    telemetry: false
  })
] : [];

module.exports = merge(shared, {
  mode: 'production',
  // Generates maps for upload without advertising them to the browser.
  devtool: 'hidden-source-map',
  plugins: sentryPlugins,
  optimization: {
    minimize: true,
    minimizer: [
      "...", // keep default minimizers (ie. js minimisation)
      new ImageMinimizerPlugin({
        minimizer: {
          implementation: ImageMinimizerPlugin.imageminMinify,
          options: {
            plugins: [
              // Svgo configuration here https://github.com/svg/svgo#configuration
              [
                "svgo",
                {
                  plugins: [
                    'preset-default',
                    {
                      name: "removeDimensions",
                    },
                  ],
                },
              ],
            ]
          }
        }
      }),
    ]
  }
});
