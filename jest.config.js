module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/assets/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', '!app/_layout.tsx', '!app/(tabs)/_layout.tsx'],
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 90, statements: 90 },
  },
};
