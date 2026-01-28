const path = require('node:path');
const createBaseWebpackConfig = require('./webpack.config.cjs');

module.exports = (runtimeName) => (options, webpack) => {
  const config = createBaseWebpackConfig(options, webpack);

  return {
    ...config,
    output: {
      ...config.output,
      filename: 'main.js',
      path: path.resolve(__dirname, '.run', runtimeName),
    },
    watchOptions: {
      ...(config.watchOptions ?? {}),
      aggregateTimeout: 200,
      ignored: ['**/.git/**', '**/.run/**', '**/coverage/**', '**/dist/**', '**/node_modules/**'],
    },
  };
};
