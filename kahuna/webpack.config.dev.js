const shared = require('./webpack.config.shared');

module.exports = {
  entry: shared.entry,
  output: shared.output,
  module: shared.module,
  resolve: shared.resolve,
  devServer: {
    publicPath: '/public/dist/',
  },
  devtool: "source-map",
};
