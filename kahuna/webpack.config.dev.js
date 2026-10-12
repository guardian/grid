const shared = require('./webpack.config.shared');
const { merge } = require('webpack-merge');
const LiveReloadPlugin = require('webpack-livereload-plugin');

module.exports = merge(shared,{
  mode: 'development',
  devServer: {
    publicPath: '/public/dist/',
  },
  plugins: [
    new LiveReloadPlugin()
  ],
});
