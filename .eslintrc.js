module.exports = {
  extends: ["eslint:recommended", "prettier"],

  rules: {
    "no-constant-condition": "off",
    "no-unused-vars": [
      "error",
      { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
    ],
  },

  env: {
    node: true,
    es2018: true,
  },
}
