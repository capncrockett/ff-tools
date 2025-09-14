/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@server/(.*)\\.js$': '<rootDir>/src/server/$1',
    '^@server/(.*)$': '<rootDir>/src/server/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  setupFiles: ['dotenv/config'],
  collectCoverage: true,
  collectCoverageFrom: ['src/server/**/*.ts'],
  coveragePathIgnorePatterns: [
    '<rootDir>/src/server/index.ts',
    '<rootDir>/src/server/jobs/',
  ],
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
}
