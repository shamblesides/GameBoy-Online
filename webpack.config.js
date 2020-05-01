const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const webpack = require('webpack');
const { name, version } = require('./package.json');

module.exports = (env, argv) => ({
  entry: {
    main: './lib/APU.js'
  },
  output: {
    filename: `apu.js`,
    library: 'APU',
    libraryTarget: 'umd',
  },
  module: {
    rules: [
      {
        test: /\.worklet.js$/,
        use: {
          loader: 'raw-loader',
        }
      },
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          }
        }
      },
      {
        test: /\.vgm$/i,
        use: [
          {
            loader: 'file-loader',
          },
        ],
      },
    ]
  },
  plugins: (env === 'dev') ? [
    new webpack.ProgressPlugin(),
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      title: 'test',
      meta: {
        viewport: "width=device-width, user-scalable=no",
      }
    }),
  ] : [
    new webpack.ProgressPlugin(),
    new CleanWebpackPlugin(),
  ],
});
