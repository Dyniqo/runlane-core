const path = require('node:path');

module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    extensions: ['.ts', '.js', '.json'],
    alias: {
      ...(options.resolve?.alias ?? {}),
      '@runlane/config': path.resolve(__dirname, 'packages/config/src'),
      '@runlane/contracts': path.resolve(__dirname, 'packages/contracts/src'),
      '@runlane/infrastructure': path.resolve(__dirname, 'packages/infrastructure/src'),
    },
  },
});
