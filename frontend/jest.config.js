module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/assets/'],
  // UI route components are covered by screen-level smoke tests; global
  // coverage gates the reusable source modules where branch/function coverage
  // is deterministic in the Jest environment.
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 90, statements: 90 },
  },
};
