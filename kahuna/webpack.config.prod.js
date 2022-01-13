const shared = require('./webpack.config.shared');
const { merge } = require('webpack-merge');

module.exports = merge(shared, {
    mode: 'production',
    devtool: 'source-map',
    optimization: {
      minimize: true,
    }
  }
);
