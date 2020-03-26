const shared = require('./webpack.config.shared');

module.exports = {
  mode: 'development',
  entry: shared.entry,
  output: shared.output,
  module: shared.module,
  resolve: shared.resolve,
  devServer: {
    publicPath: '/public/dist/',
  },
  devtool: "source-map",
};
