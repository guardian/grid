const shared = require('./webpack.config.shared');
const merge = require('webpack-merge');

module.exports = merge(shared,{
  mode: 'development',
  devServer: {
    publicPath: '/public/dist/',
  },
});
