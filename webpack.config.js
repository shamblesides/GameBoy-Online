const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: {
    main: './index.js'
  },
  output: {
    filename: '[name].[contentHash].bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          }
        }
      },
    ]
  },
  plugins: [
    new webpack.ProgressPlugin(),
    // new CleanWebpackPlugin(['dist/*']),
    new HtmlWebpackPlugin({
      template: './index.xhtml',
      minify: false,
      inject: true,
    }),
  ],
};
