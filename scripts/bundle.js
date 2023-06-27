#!/usr/bin/env node
/* eslint-disable vars-on-top, func-names */

'use strict';

require('module-alias/register');

let path = require('path');
let webpack = require('webpack');
let pjson = require('../package.json');
let promiseSequence = require('./lib/utils').promiseSequence;
let UglifyJsPlugin = require('uglifyjs-webpack-plugin');
let TEST_ENV = (process.env.NODE_ENV === 'test');

let destDir = path.resolve(path.join(
  __dirname,
  (TEST_ENV) ? '../tests/browser' : '../browser'));

function runWebpack(opts) {
  let type = (opts.slim) ? '(slim, only works with precompiled templates)' : '';
  let ext = (opts.min) ? '.min.js' : '.js';
  if (opts.slim) {
    ext = '-slim' + ext;
  }
  let filename = 'nunjucks' + ext;

  return new Promise(function(resolve, reject) {
    try {
      let config = {
        entry: './nunjucks/index.js',
        devtool: 'source-map',
        output: {
          path: destDir,
          filename: filename,
          library: 'nunjucks',
          libraryTarget: 'umd',
          devtoolModuleFilenameTemplate: function(info) {
            return path.relative(destDir, info.absoluteResourcePath);
          }
        },
        node: {
          process: false,
          setImmediate: false
        },
        module: {
          rules: [{
            test: /nunjucks/,
            exclude: /(node_modules|browser|tests)(?!\.js)/,
            use: {
              loader: 'babel-loader',
              options: {
                plugins: [['module-resolver', {
                  extensions: ['.js'],
                  resolvePath: function(sourcePath) {
                    if (sourcePath.match(/^(fs|path|chokidar)$/)) {
                      return 'node-libs-browser/mock/empty';
                    }
                    if (opts.slim) {
                      if (sourcePath.match(/(nodes|lexer|parser|precompile|transformer|compiler)(\.js)?$/)) {
                        return 'node-libs-browser/mock/empty';
                      }
                    }
                    if (sourcePath.match(/\/loaders(\.js)?$/)) {
                      return sourcePath.replace('loaders', (opts.slim) ? 'precompiled-loader' : 'web-loaders');
                    }
                    return null;
                  },
                }]]
              }
            }
          }]
        },
        plugins: [
          new webpack.BannerPlugin(
            'Browser bundle of nunjucks ' + pjson.version + ' ' + type
          ),
          new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
            'process.env.BUILD_TYPE': JSON.stringify((opts.slim) ? 'SLIM' : 'STD'),
          }),
        ]
      };

      if (opts.min) {
        config.plugins.push(
          new UglifyJsPlugin({
            sourceMap: true,
            uglifyOptions: {
              mangle: {
                properties: {
                  regex: /^_[^_]/
                }
              },
              compress: {
                unsafe: true
              }
            }
          })
        );
      }

      webpack(config).run(function(err, stats) {
        if (err) {
          reject(err);
        } else {
          resolve(stats.toString({cached: false, cachedAssets: false}));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

let runConfigs = [
  {min: true, slim: false},
  {min: true, slim: true}
];

if (!TEST_ENV) {
  runConfigs.unshift(
    {min: false, slim: false},
    {min: false, slim: true});
}

let promises = runConfigs.map(function(opts) {
  return function() {
    return runWebpack(opts).then(function(stats) {
      console.log(stats); // eslint-disable-line no-console
    });
  };
});

promiseSequence(promises).catch(function(err) {
  throw err;
});
