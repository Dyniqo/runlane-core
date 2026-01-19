const path = require('node:path');

module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    extensions: ['.ts', '.js', '.json'],
    alias: {
      ...(options.resolve?.alias ?? {}),
      '@runlane/application': path.resolve(__dirname, 'packages/application/src'),
      '@runlane/config': path.resolve(__dirname, 'packages/config/src'),
      '@runlane/contracts': path.resolve(__dirname, 'packages/contracts/src'),
      '@runlane/domain': path.resolve(__dirname, 'packages/domain/src'),
      '@runlane/infrastructure': path.resolve(__dirname, 'packages/infrastructure/src'),
      '@runlane/testing': path.resolve(__dirname, 'packages/testing/src'),
    },
  },
});
