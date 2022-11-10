const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

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
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true
        },
        exclude: [
          path.resolve(__dirname, 'public', 'js', 'dist'),
          /node_modules/,
        ]
      },
      {
        test: /\.js$/,
        exclude: [
          path.resolve(__dirname, 'public', 'dist'),
          /node_modules/,
        ],
        loader: 'babel-loader',
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
      },
      {
        test: /\.svg$/,
        type: 'asset/source',
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          {
            loader:'css-loader',
            options: {
              modules: {
                auto: true,
                localIdentName: '[name]_[local]--[hash:base64:5]'
              }
            }
          }
        ],
      },
      {
        test: /\.png$/,
        type: 'asset/resource'
      }
    ],
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin()
  ],
  resolve: {
    mainFields: ['main', 'browser'],
    alias: {
      'rx': 'rx/dist/rx.all',
    },
    extensions: ['.ts', '.tsx', '.js', '.json']
  },
  devtool: "source-map",
};
