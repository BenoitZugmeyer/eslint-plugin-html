"use strict"
module.exports = {
  moduleNameMapper: {
    "@eslint/eslintrc/universal":
      "<rootDir>/node_modules/@eslint/eslintrc/dist/eslintrc-universal.cjs",
  },
  prettierPath: null,
  testPathIgnorePatterns: ["/node_modules/", "/fixtures/"],
}
