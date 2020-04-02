const TerserPlugin = require('terser-webpack-plugin');
const shared = require('./webpack.config.shared');
const merge = require('webpack-merge');

module.exports = merge(shared, {
    mode: 'production',
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin({
        sourceMap: true
      })]

    }
  }
);
