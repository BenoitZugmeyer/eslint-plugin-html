import * as eslint from "eslint"
import * as semver from "semver"
import { it, describe } from "node:test"
import * as assert from "node:assert"
import * as path from "node:path"
import { createRequire } from "node:module"

import eslintPluginHtml, { createHtmlProcessor } from "../index.js"

const require = createRequire(import.meta.url)
const eslintVersion = require("eslint/package.json").version

const DEFAULT_HTML_CONFIG = {
  files: ["**/*.html"],
  plugins: {
    html: eslintPluginHtml,
  },
  processor: "html/html",
}

const DEFAULT_JS_CONFIG = {
  files: ["**/*.js"],
  rules: {
    "no-console": "error",
  },
}

function matchVersion(versionSpec) {
  return semver.satisfies(eslintVersion, versionSpec, {
    includePrerelease: true,
  })
}

function ifVersion(versionSpec, fn, ...args) {
  const execFn = matchVersion(versionSpec) ? fn : fn.skip
  execFn(...args)
}

async function execute(file, eslintOptions = {}) {
  const instance = new eslint.ESLint({
    baseConfig: [DEFAULT_HTML_CONFIG, DEFAULT_JS_CONFIG],
    ignore: false,
    ignorePatterns: [],
    overrideConfigFile: true,
    ...eslintOptions,
  })
  const results = (
    await instance.lintFiles([path.join(import.meta.dirname, "fixtures", file)])
  )[0]

  return {
    output: results?.output,
    rawMessages: results?.messages,
    messages: results?.messages.map(
      ({ line, column, endLine, endColumn, ruleId, message }) => {
        let formatted = `${line}:${column}`
        if (endLine !== undefined && endColumn !== undefined) {
          formatted += `-${endLine}:${endColumn}`
        }
        if (ruleId) {
          formatted += ` ${ruleId}:`
        }
        formatted += ` ${message}`
        return formatted
      }
    ),
  }
}

it("should extract and remap messages", async () => {
  const { messages } = await execute("simple.html")
  assert.deepStrictEqual(messages, [
    "8:7-8:18 no-console: Unexpected console statement.",
    "14:7-14:18 no-console: Unexpected console statement.",
    "20:3-20:14 no-console: Unexpected console statement.",
    "25:11-25:22 no-console: Unexpected console statement.",
    "28:13-28:24 no-console: Unexpected console statement.",
  ])
})

it("does not apply the plugin if it is not used in the configuration", async () => {
  const { messages } = await execute("simple.html", {
    baseConfig: [{ files: ["**/*.html"] }],
  })
  assert.deepStrictEqual(messages, ["1:1 Parsing error: Unexpected token <"])
})

it("should report correct line numbers with crlf newlines", async () => {
  const { messages } = await execute("crlf-newlines.html")
  assert.deepStrictEqual(messages, [
    "8:7-8:18 no-console: Unexpected console statement.",
  ])
})

describe("processor indent option", () => {
  it("should automatically compute indent when nothing is specified", async () => {
    const { messages } = await execute("indent-setting.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            indent: [2, 2],
          },
        },
      ],
    })
    assert.strictEqual(messages.length, 0)
  })

  it("should work with a zero absolute indentation descriptor", async () => {
    const { messages } = await execute("indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: createHtmlProcessor({
            indent: 0,
          }),
        },
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            indent: [2, 2],
          },
        },
      ],
    })
    // Only the first script is correctly indented (aligned on the first column)
    assert.deepStrictEqual(messages, [
      "16:1-16:3 indent: Expected indentation of 0 spaces but found 2.",
      "17:1-17:5 indent: Expected indentation of 2 spaces but found 4.",
      "18:1-18:3 indent: Expected indentation of 0 spaces but found 2.",
      "22:1-22:7 indent: Expected indentation of 0 spaces but found 6.",
      "23:1-23:9 indent: Expected indentation of 2 spaces but found 8.",
      "24:1-24:7 indent: Expected indentation of 0 spaces but found 6.",
      "28:1-28:11 indent: Expected indentation of 0 spaces but found 10.",
      "29:1-29:13 indent: Expected indentation of 2 spaces but found 12.",
      "30:1-30:11 indent: Expected indentation of 0 spaces but found 10.",
    ])
  })

  it("should work with a non-zero absolute indentation descriptor", async () => {
    const { messages } = await execute("indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: createHtmlProcessor({
            indent: 2,
          }),
        },
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            indent: [2, 2],
          },
        },
      ],
    })
    // The first script is incorrect since the second line gets dedented
    assert.deepStrictEqual(messages, [
      "11:3-11:3 indent: Expected indentation of 2 spaces but found 0.",
      "22:1-22:7 indent: Expected indentation of 0 spaces but found 6.",
      "23:3-23:9 indent: Expected indentation of 2 spaces but found 6.",
      "24:3-24:7 indent: Expected indentation of 0 spaces but found 4.",
      "28:1-28:11 indent: Expected indentation of 0 spaces but found 10.",
      "29:3-29:13 indent: Expected indentation of 2 spaces but found 10.",
      "30:3-30:11 indent: Expected indentation of 0 spaces but found 8.",
    ])
  })

  it("should work with relative indentation descriptor", async () => {
    const { messages } = await execute("indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: createHtmlProcessor({
            indent: "+2",
          }),
        },
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            indent: [2, 2],
          },
        },
      ],
    })
    // The first script is correct since it can't be dedented, but follows the indent
    // rule anyway.
    assert.deepStrictEqual(messages, [
      "16:1-16:3 indent: Expected indentation of 0 spaces but found 2.",
      "17:1-17:5 indent: Expected indentation of 2 spaces but found 4.",
      "18:1-18:3 indent: Expected indentation of 0 spaces but found 2.",
      "28:1-28:11 indent: Expected indentation of 0 spaces but found 10.",
      "29:9-29:13 indent: Expected indentation of 2 spaces but found 4.",
      "30:9-30:11 indent: Expected indentation of 0 spaces but found 2.",
    ])
  })

  it("should report messages at the beginning of the file", async () => {
    const { messages } = await execute("error-at-the-beginning.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: createHtmlProcessor({
            indent: 2,
          }),
        },
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "max-lines": [
              2,
              {
                max: 3,
              },
            ],
            "max-len": [
              2,
              {
                code: 35,
              },
            ],
          },
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "1:9-1:79 max-len: This line has a length of 70. Maximum allowed is 35.",

      "4:1-7:1 max-lines: File has too many lines (6). Maximum allowed is 3.",
    ])
  })
})

describe("processor reports bad indent", () => {
  it("should report under-indented code with auto indent setting", async () => {
    const { messages } = await execute("report-bad-indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: createHtmlProcessor({ reportBadIndent: true }),
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "10:1 (html plugin): Bad line indentation.",
    ])
  })

  it("should report under-indented code with provided indent setting", async () => {
    const { messages } = await execute("report-bad-indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: createHtmlProcessor({
            reportBadIndent: true,
            indent: "+4",
          }),
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "9:1 (html plugin): Bad line indentation.",
      "10:1 (html plugin): Bad line indentation.",
      "11:1 (html plugin): Bad line indentation.",
    ])
  })
})

describe("processor xml option", () => {
  const HTML_CONFIG_WITH_XML = {
    ...DEFAULT_HTML_CONFIG,
    files: ["**/*.xhtml"],
    processor: createHtmlProcessor({ xml: true }),
  }

  it("consider .xhtml files as XML", async () => {
    const { messages } = await execute("cdata.xhtml", {
      baseConfig: [HTML_CONFIG_WITH_XML, DEFAULT_JS_CONFIG],
    })
    assert.deepStrictEqual(messages, [
      "13:9-13:20 no-console: Unexpected console statement.",
    ])
  })

  it("removes white space at the end of scripts ending with CDATA", async () => {
    const { messages } = await execute("cdata.xhtml", {
      baseConfig: [
        HTML_CONFIG_WITH_XML,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-trailing-spaces": "error",
            "eol-last": "error",
          },
        },
      ],
    })
    assert.strictEqual(messages.length, 0)
  })

  it("should support self closing script tags", async () => {
    const { messages } = await execute("self-closing-tags.xhtml", {
      baseConfig: [HTML_CONFIG_WITH_XML, DEFAULT_JS_CONFIG],
    })
    assert.deepStrictEqual(messages, [])
  })
})

describe("lines-around-comment and multiple scripts", () => {
  it("should not warn with lines-around-comment if multiple scripts", async () => {
    const { messages } = await execute("simple.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "lines-around-comment": [
              "error",
              {
                beforeLineComment: true,
              },
            ],
            "no-console": "error",
          },
        },
      ],
    })
    assert.strictEqual(messages.length, 5)
  })
})

describe("fix", () => {
  it("should remap fix ranges", async () => {
    const { rawMessages } = await execute("fix.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-extra-semi": ["error"],
          },
        },
      ],
    })
    assert.deepStrictEqual(rawMessages[0].fix.range, [53, 55])
  })

  it("should fix errors", async () => {
    const result = await execute("fix.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-extra-semi": ["error"],
          },
        },
      ],
      fix: true,
    })
    assert.strictEqual(
      result.output,
      `<!DOCTYPE html>
<html lang="en">
  <script>
    foo();
  </script>
</html>
`
    )
    assert.strictEqual(result.messages.length, 0)
  })

  it("should fix errors in files with BOM", async () => {
    const result = await execute("fix-bom.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-extra-semi": ["error"],
          },
        },
      ],
      fix: true,
    })
    assert.strictEqual(
      result.output,
      `\uFEFF<!DOCTYPE html>
<html lang="en">
  <script>
    foo();
  </script>
</html>
`
    )
    assert.strictEqual(result.messages.length, 0)
  })

  describe("eol-last rule", () => {
    it("should work with eol-last always", async () => {
      const result = await execute("fix.html", {
        baseConfig: [
          DEFAULT_HTML_CONFIG,
          {
            ...DEFAULT_JS_CONFIG,
            rules: {
              "eol-last": ["error"],
              "no-extra-semi": ["error"],
            },
          },
        ],
        fix: true,
      })
      assert.strictEqual(
        result.output,
        `<!DOCTYPE html>
<html lang="en">
  <script>
    foo();
  </script>
</html>
`
      )
      assert.strictEqual(result.messages.length, 0)
    })

    it("should work with eol-last never", async () => {
      const result = await execute("fix.html", {
        baseConfig: [
          DEFAULT_HTML_CONFIG,
          {
            ...DEFAULT_JS_CONFIG,
            rules: {
              "eol-last": ["error", "never"],
            },
          },
        ],
        fix: true,
      })
      assert.strictEqual(
        result.output,
        `<!DOCTYPE html>
<html lang="en">
  <script>
    foo();;  </script>
</html>
`
      )
      assert.strictEqual(result.messages.length, 0)
    })
  })
})

describe("reportUnusedDisableDirectives", () => {
  it("reports unused disabled directives", async () => {
    const { messages } = await execute("inline-disabled-rule.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          linterOptions: {
            reportUnusedDisableDirectives: "error",
          },
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "2:3 Unused eslint-disable directive (no problems were reported from 'no-eval').",
    ])
  })

  it("doesn't report used disabled directives", async () => {
    const { messages } = await execute("inline-disabled-rule.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          linterOptions: {
            reportUnusedDisableDirectives: "error",
          },
          rules: {
            "no-eval": 2,
          },
        },
      ],
    })
    assert.strictEqual(messages.length, 0)
  })
})

it("ignores tags without type attribute", async () => {
  const { messages } = await execute("javascript-mime-types.html", {
    baseConfig: [
      {
        ...DEFAULT_HTML_CONFIG,
        processor: createHtmlProcessor({
          rules: [
            {
              match: "script[type]",
            },
          ],
        }),
      },
      DEFAULT_JS_CONFIG,
    ],
  })
  assert.strictEqual(messages.length, 4)
})

it("ignores unknown mime types by default", async () => {
  const { messages } = await execute("javascript-mime-types.html")
  assert.deepStrictEqual(messages, [
    "8:7-8:18 no-console: Unexpected console statement.",
    "12:7-12:18 no-console: Unexpected console statement.",
    "16:7-16:18 no-console: Unexpected console statement.",
  ])
})

it("specifies a list of valid mime types", async () => {
  const { messages } = await execute("javascript-mime-types.html", {
    baseConfig: [
      {
        ...DEFAULT_HTML_CONFIG,
        processor: createHtmlProcessor({
          rules: [{ match: "[type='text/foo']" }],
        }),
      },
      DEFAULT_JS_CONFIG,
    ],
  })
  assert.deepStrictEqual(messages, [
    "20:7-20:18 no-console: Unexpected console statement.",
  ])
})

it("should report correct eol-last message position", async () => {
  const { messages } = await execute("eol-last.html", {
    baseConfig: [
      DEFAULT_HTML_CONFIG,
      {
        ...DEFAULT_JS_CONFIG,
        rules: {
          "eol-last": "error",
        },
      },
    ],
  })
  assert.deepStrictEqual(messages, [
    "6:42 eol-last: Newline required at end of file but not found.",
  ])
})

describe("scope sharing", () => {
  it("should export global variables between script scopes", async () => {
    const { messages } = await execute("scope-sharing.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-undef": "error",
          },
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "13:7-13:32 no-undef: 'varNotYetGloballyDeclared' is not defined.",
      "14:7-14:32 no-undef: 'letNotYetGloballyDeclared' is not defined.",
      "15:7-15:37 no-undef: 'functionNotYetGloballyDeclared' is not defined.",
      "16:7-16:34 no-undef: 'ClassNotYetGloballyDeclared' is not defined.",
    ])
  })

  it("should mark variable as used when the variable is used in another tag", async () => {
    const { messages } = await execute("scope-sharing.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-unused-vars": "error",
          },
          languageOptions: {
            sourceType: "script",
          },
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "20:11-20:36 no-unused-vars: 'varNotYetGloballyDeclared' is assigned a value but never used.",
      "21:11-21:36 no-unused-vars: 'letNotYetGloballyDeclared' is assigned a value but never used.",
      "22:16-22:46 no-unused-vars: 'functionNotYetGloballyDeclared' is defined but never used.",
      "23:13-23:40 no-unused-vars: 'ClassNotYetGloballyDeclared' is defined but never used.",
    ])
  })

  it("reports an error in case of syntax error", async () => {
    const { messages } = await execute("scope-sharing-error.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-undef": "error",
          },
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "8:9 Preprocessing error: Failed to parse script (1): SyntaxError: Unexpected token b",
    ])
  })

  it("ECMA feature 'globalReturn'", async () => {
    const { messages } = await execute("scope-sharing.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-undef": "error",
            "no-unused-vars": "error",
          },
          languageOptions: {
            sourceType: "module",
            parserOptions: {
              ecmaFeatures: {
                globalReturn: true,
              },
            },
          },
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "8:11-8:30 no-unused-vars: 'varGloballyDeclared' is assigned a value but never used.",
      "9:11-9:30 no-unused-vars: 'letGloballyDeclared' is assigned a value but never used.",
      "10:16-10:40 no-unused-vars: 'functionGloballyDeclared' is defined but never used.",
      "11:13-11:34 no-unused-vars: 'ClassGloballyDeclared' is defined but never used.",
      "13:7-13:32 no-undef: 'varNotYetGloballyDeclared' is not defined.",
      "14:7-14:32 no-undef: 'letNotYetGloballyDeclared' is not defined.",
      "15:7-15:37 no-undef: 'functionNotYetGloballyDeclared' is not defined.",
      "16:7-16:34 no-undef: 'ClassNotYetGloballyDeclared' is not defined.",
      "20:11-20:36 no-unused-vars: 'varNotYetGloballyDeclared' is assigned a value but never used.",
      "21:11-21:36 no-unused-vars: 'letNotYetGloballyDeclared' is assigned a value but never used.",
      "22:16-22:46 no-unused-vars: 'functionNotYetGloballyDeclared' is defined but never used.",
      "23:13-23:40 no-unused-vars: 'ClassNotYetGloballyDeclared' is defined but never used.",
    ])
  })

  it("should not share the global scope if sourceType is 'module'", async () => {
    const { messages } = await execute("scope-sharing.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: createHtmlProcessor({
            rules: [{ match: "script", type: "module" }],
          }),
        },
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-undef": "error",
            "no-unused-vars": "error",
          },
        },
      ],
    })
    assert.deepStrictEqual(messages, [
      "8:11-8:30 no-unused-vars: 'varGloballyDeclared' is assigned a value but never used.",
      "9:11-9:30 no-unused-vars: 'letGloballyDeclared' is assigned a value but never used.",
      "10:16-10:40 no-unused-vars: 'functionGloballyDeclared' is defined but never used.",
      "11:13-11:34 no-unused-vars: 'ClassGloballyDeclared' is defined but never used.",
      "13:7-13:32 no-undef: 'varNotYetGloballyDeclared' is not defined.",
      "14:7-14:32 no-undef: 'letNotYetGloballyDeclared' is not defined.",
      "15:7-15:37 no-undef: 'functionNotYetGloballyDeclared' is not defined.",
      "16:7-16:34 no-undef: 'ClassNotYetGloballyDeclared' is not defined.",
      "20:11-20:36 no-unused-vars: 'varNotYetGloballyDeclared' is assigned a value but never used.",
      "21:11-21:36 no-unused-vars: 'letNotYetGloballyDeclared' is assigned a value but never used.",
      "22:16-22:46 no-unused-vars: 'functionNotYetGloballyDeclared' is defined but never used.",
      "23:13-23:40 no-unused-vars: 'ClassNotYetGloballyDeclared' is defined but never used.",
      "25:7-25:26 no-undef: 'varGloballyDeclared' is not defined.",
      "26:7-26:26 no-undef: 'letGloballyDeclared' is not defined.",
      "27:7-27:31 no-undef: 'functionGloballyDeclared' is not defined.",
      "28:7-28:28 no-undef: 'ClassGloballyDeclared' is not defined.",
    ])
  })
})

// For some reason @html-eslint is not compatible with ESLint < 5
describe("compatibility with external HTML plugins", () => {
  ifVersion(">= 9.7.0", it, "check with language config", async () => {
    await assertCheck({
      language: "@html-eslint/html",
    })
  })

  it("check with parser config", async () => {
    await assertCheck({
      languageOptions: {
        parser: require("@html-eslint/parser"),
      },
    })
  })

  async function assertCheck(baseHtmlEslintConfig) {
    const { messages } = await execute(
      "other-html-plugins-compatibility.html",
      {
        baseConfig: [
          {
            files: ["**/*.html"],
            plugins: {
              "@html-eslint": require("@html-eslint/eslint-plugin"),
            },
            processor: createHtmlProcessor({
              lintHtml: true,
            }),
            ...baseHtmlEslintConfig,
            rules: {
              "@html-eslint/require-img-alt": "error",
            },
          },
          DEFAULT_JS_CONFIG,
        ],
      }
    )
    assert.deepStrictEqual(messages, [
      "1:1-1:13 @html-eslint/require-img-alt: Missing `alt` attribute at `<img>` tag",
      "3:3-3:14 no-console: Unexpected console statement.",
    ])
  }

  ifVersion(">= 9.7.0", it, "fix with language config", async () => {
    await assertFix({
      language: "@html-eslint/html",
    })
  })

  it("fix with parser config", async () => {
    await assertFix({
      languageOptions: {
        parser: require("@html-eslint/parser"),
      },
    })
  })

  async function assertFix(baseHtmlEslintConfig) {
    const result = await execute("other-html-plugins-compatibility.html", {
      baseConfig: [
        {
          files: ["**/*.html"],
          plugins: {
            "@html-eslint": require("@html-eslint/eslint-plugin"),
          },
          processor: createHtmlProcessor({
            lintHtml: true,
          }),
          ...baseHtmlEslintConfig,
          rules: {
            "@html-eslint/quotes": ["error", "single"],
          },
        },
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            quotes: ["error", "single"],
          },
        },
      ],
      fix: true,
    })
    assert.deepStrictEqual(
      result.output,
      `\
<img src=''>
<script>
  console.log('toto')
</script>
`
    )
  }
})
