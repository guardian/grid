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
          path.resolve(__dirname, 'public', 'dist'),
          /node_modules/,
        ],
        loader: 'babel-loader',
      },
      {
        test: /.html$/,
        loader: 'html-loader',
      },
      {
        test: /\.svg$/,
        type: 'asset/source',
      },
      {
        test: /.css$/,
        use: [
          'style-loader',
          'css-loader'
        ],
      },
      {
        test: /\.png$/,
        type: 'asset/resource'
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
