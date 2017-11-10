const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './public/js/main.js',
  output: {
    path: path.resolve(__dirname, 'public', 'dist'),
    publicPath: '/assets/',
    filename: 'build.js',
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
      },
      {
        test: require.resolve('jquery'),
        use: [
          {
            loader: 'expose-loader',
            options: 'jQuery'
          },
          {
            loader: 'expose-loader',
            options: '$'
          },
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
