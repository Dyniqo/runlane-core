const path = require('node:path');

module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    extensions: ['.ts', '.js', '.json'],
    alias: {
      ...(options.resolve?.alias ?? {}),
      '@runlane/contracts': path.resolve(__dirname, 'packages/contracts/src'),
    },
  },
});
