const path = require('path');

module.exports = {
  entry: {
    build: './public/js/main.js',
    quotas: './public/js/quotas.js'
  },
  output: {
    path: path.resolve(__dirname, 'public', 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /.js$/,
        exclude: [
          path.resolve(__dirname, 'public', 'js', 'dist'),
          /node_modules/,
        ],
        loader: 'babel-loader',
      },
      {
        test: /.html$/,
        loader: 'html-loader',
      },
      {
        test: /.svg$/,
        loader: 'svg-inline-loader',
      },
      {
        test: /.css$/,
        use: [
          'style-loader',
          'css-loader'
        ],
      }
    ],
  },
  resolve: {
    mainFields: ['main', 'browser'],
    alias: {
      'rx': 'rx/dist/rx.all',
    },
  },
  devtool: "source-map",
};
