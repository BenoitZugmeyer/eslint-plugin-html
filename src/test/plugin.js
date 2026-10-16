import * as eslint from "eslint"
import * as semver from "semver"
import { it, describe } from "node:test"
import * as assert from "node:assert"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import markdown from "@eslint/markdown"
import * as espree from "espree"

import eslintPluginHtml, {
  parser as eslintPluginHtmlParser,
  processor as eslintPluginHtmlProcessor,
} from "../index.js"

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
  files: ["**/*.js", "**/*.mjs"],
  rules: {
    "no-console": "error",
  },
}

const SCOPE_SHARING_CONFIG = {
  files: ["**/*.html/*.js", "**/*.html/*.mjs"],
  plugins: {
    html: eslintPluginHtml,
  },
  languageOptions: {
    parser: eslintPluginHtmlParser,
  },
  rules: {
    "html/scope-sharing": "error",
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

const getFixturePath = (file) =>
  fileURLToPath(new URL(`fixtures/${file}`, import.meta.url))

const createESLint = (eslintOptions) =>
  new eslint.ESLint({
    baseConfig: [DEFAULT_HTML_CONFIG, DEFAULT_JS_CONFIG],
    ignore: false,
    ignorePatterns: [],
    overrideConfigFile: true,
    ...eslintOptions,
  })

async function execute(file, eslintOptions = {}) {
  const results = (
    await createESLint(eslintOptions).lintFiles([getFixturePath(file)])
  )[0]

  return eslintOptions.fix ? results : results && results.messages
}

// Lints the text as if it was a file of the fixtures directory
const executeText = async (
  text,
  eslintOptions = {},
  filename = "virtual.html"
) => {
  const [result] = await createESLint(eslintOptions).lintText(text, {
    filePath: getFixturePath(filename),
  })

  return eslintOptions.fix ? result : result.messages
}

const toLocatedMessages = (messages) =>
  messages.map(
    ({ ruleId, line, column, message }) =>
      `${line}:${column} ${ruleId} ${message}`
  )

it("should extract and remap messages", async () => {
  const messages = await execute("simple.html")
  assert.strictEqual(messages.length, 5)

  assert.strictEqual(messages[0].message, "Unexpected console statement.")
  assert.strictEqual(messages[0].line, 8)
  assert.strictEqual(messages[0].column, 7)
  assert.strictEqual(messages[0].endLine, 8)
  assert.strictEqual(messages[0].endColumn, 18)

  assert.strictEqual(messages[1].message, "Unexpected console statement.")
  assert.strictEqual(messages[1].line, 14)
  assert.strictEqual(messages[1].column, 7)
  assert.strictEqual(messages[1].endLine, 14)
  assert.strictEqual(messages[1].endColumn, 18)

  assert.strictEqual(messages[2].message, "Unexpected console statement.")
  assert.strictEqual(messages[2].line, 20)
  assert.strictEqual(messages[2].column, 3)
  assert.strictEqual(messages[2].endLine, 20)
  assert.strictEqual(messages[2].endColumn, 14)

  assert.strictEqual(messages[3].message, "Unexpected console statement.")
  assert.strictEqual(messages[3].line, 25)
  assert.strictEqual(messages[3].column, 11)
  assert.strictEqual(messages[3].endLine, 25)
  assert.strictEqual(messages[3].endColumn, 22)

  assert.strictEqual(messages[4].message, "Unexpected console statement.")
  assert.strictEqual(messages[4].line, 28)
  assert.strictEqual(messages[4].column, 13)
  assert.strictEqual(messages[4].endLine, 28)
  assert.strictEqual(messages[4].endColumn, 24)
})

it("does not apply the plugin if it is not used in the configuration", async () => {
  const messages = await execute("simple.html", {
    baseConfig: [{ files: ["**/*.html"] }],
  })
  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].message, "Parsing error: Unexpected token <")
})

it("should report correct line numbers with crlf newlines", async () => {
  const messages = await execute("crlf-newlines.html")
  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].message, "Unexpected console statement.")
  assert.strictEqual(messages[0].line, 8)
  assert.strictEqual(messages[0].column, 7)
})

describe("processor indent option", () => {
  it("should automatically compute indent when nothing is specified", async () => {
    const messages = await execute("indent-setting.html", {
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
    const messages = await execute("indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: eslintPluginHtmlProcessor({
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
    assert.strictEqual(messages.length, 9) // Only the first script is correctly indented (aligned on the first column)
    assert.match(
      messages[0].message,
      /Expected indentation of 0 .* but found 2\./
    )
    assert.strictEqual(messages[0].line, 16)
    assert.match(
      messages[1].message,
      /Expected indentation of 2 .* but found 4\./
    )
    assert.strictEqual(messages[1].line, 17)
    assert.match(
      messages[2].message,
      /Expected indentation of 0 .* but found 2\./
    )
    assert.strictEqual(messages[2].line, 18)
    assert.match(
      messages[3].message,
      /Expected indentation of 0 .* but found 6\./
    )
    assert.strictEqual(messages[3].line, 22)
    assert.match(
      messages[4].message,
      /Expected indentation of 2 .* but found 8\./
    )
    assert.strictEqual(messages[4].line, 23)
    assert.match(
      messages[5].message,
      /Expected indentation of 0 .* but found 6\./
    )
    assert.strictEqual(messages[5].line, 24)
    assert.match(
      messages[6].message,
      /Expected indentation of 0 .* but found 10\./
    )
    assert.strictEqual(messages[6].line, 28)
    assert.match(
      messages[7].message,
      /Expected indentation of 2 .* but found 12\./
    )
    assert.strictEqual(messages[7].line, 29)
    assert.match(
      messages[8].message,
      /Expected indentation of 0 .* but found 10\./
    )
    assert.strictEqual(messages[8].line, 30)
  })

  it("should work with a non-zero absolute indentation descriptor", async () => {
    const messages = await execute("indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: eslintPluginHtmlProcessor({
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
    assert.strictEqual(messages.length, 7) // The first script is incorrect since the second line gets dedented
    assert.match(
      messages[0].message,
      /Expected indentation of 2 .* but found 0\./
    )
    assert.strictEqual(messages[0].line, 11) // The second script is correct.
    assert.match(
      messages[1].message,
      /Expected indentation of 0 .* but found 6\./
    )
    assert.strictEqual(messages[1].line, 22)
    assert.match(
      messages[2].message,
      /Expected indentation of .* but found 6\./
    )
    assert.strictEqual(messages[2].line, 23)
    assert.match(
      messages[3].message,
      /Expected indentation of .* but found 4\./
    )
    assert.strictEqual(messages[3].line, 24)
    assert.match(
      messages[4].message,
      /Expected indentation of 0 .* but found 10\./
    )
    assert.strictEqual(messages[4].line, 28)
    assert.match(
      messages[5].message,
      /Expected indentation of .* but found 10\./
    )
    assert.strictEqual(messages[5].line, 29)
    assert.match(
      messages[6].message,
      /Expected indentation of .* but found 8\./
    )
    assert.strictEqual(messages[6].line, 30)
  })

  it("should work with relative indentation descriptor", async () => {
    const messages = await execute("indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: eslintPluginHtmlProcessor({
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
    assert.strictEqual(messages.length, 6) // The first script is correct since it can't be dedented, but follows the indent
    // rule anyway.
    assert.match(
      messages[0].message,
      /Expected indentation of 0 .* but found 2\./
    )
    assert.strictEqual(messages[0].line, 16)
    assert.match(
      messages[1].message,
      /Expected indentation of 2 .* but found 4\./
    )
    assert.strictEqual(messages[1].line, 17)
    assert.match(
      messages[2].message,
      /Expected indentation of 0 .* but found 2\./
    )
    assert.strictEqual(messages[2].line, 18) // The third script is correct.
    assert.match(
      messages[3].message,
      /Expected indentation of 0 .* but found 10\./
    )
    assert.strictEqual(messages[3].line, 28)
    assert.match(
      messages[4].message,
      /Expected indentation of 2 .* but found 4\./
    )
    assert.strictEqual(messages[4].line, 29)
    assert.match(
      messages[5].message,
      /Expected indentation of 0 .* but found 2\./
    )
    assert.strictEqual(messages[5].line, 30)
  })

  it("should report messages at the beginning of the file", async () => {
    const messages = await execute("error-at-the-beginning.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: eslintPluginHtmlProcessor({
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
    assert.strictEqual(messages.length, 2)
    assert.strictEqual(
      messages[0].message,
      "This line has a length of 70. Maximum allowed is 35."
    )
    assert.strictEqual(messages[0].line, 1)
    assert.strictEqual(messages[0].column, 9)
    assert.strictEqual(
      messages[1].message,
      "File has too many lines (6). Maximum allowed is 3."
    )
    assert.strictEqual(messages[1].line, 4)
    assert.strictEqual(messages[1].column, 1)
  })
})

describe("processor reports bad indent", () => {
  it("should report under-indented code with auto indent setting", async () => {
    const messages = await execute("report-bad-indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: eslintPluginHtmlProcessor({ reportBadIndent: true }),
        },
      ],
    })
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Bad line indentation.")
    assert.strictEqual(messages[0].line, 10)
    assert.strictEqual(messages[0].column, 1)
  })

  it("should report under-indented code with provided indent setting", async () => {
    const messages = await execute("report-bad-indent-setting.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: eslintPluginHtmlProcessor({
            reportBadIndent: true,
            indent: "+4",
          }),
        },
      ],
    })
    assert.strictEqual(messages.length, 3)
    assert.strictEqual(messages[0].message, "Bad line indentation.")
    assert.strictEqual(messages[0].line, 9)
    assert.strictEqual(messages[0].column, 1)
    assert.strictEqual(messages[1].message, "Bad line indentation.")
    assert.strictEqual(messages[1].line, 10)
    assert.strictEqual(messages[1].column, 1)
    assert.strictEqual(messages[2].message, "Bad line indentation.")
    assert.strictEqual(messages[2].line, 11)
    assert.strictEqual(messages[2].column, 1)
  })
})

describe("processor xml option", () => {
  const HTML_CONFIG_WITH_XML = {
    ...DEFAULT_HTML_CONFIG,
    files: ["**/*.xhtml"],
    processor: eslintPluginHtmlProcessor({ xml: true }),
  }

  it("consider .xhtml files as XML", async () => {
    const messages = await execute("cdata.xhtml", {
      baseConfig: [HTML_CONFIG_WITH_XML, DEFAULT_JS_CONFIG],
    })
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Unexpected console statement.")
    assert.strictEqual(messages[0].line, 13)
    assert.strictEqual(messages[0].column, 9)
  })

  it("removes white space at the end of scripts ending with CDATA", async () => {
    const messages = await execute("cdata.xhtml", {
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
    const messages = await execute("self-closing-tags.xhtml", {
      baseConfig: [HTML_CONFIG_WITH_XML, DEFAULT_JS_CONFIG],
    })
    assert.deepStrictEqual(messages, [])
  })
})

describe("lines-around-comment and multiple scripts", () => {
  it("should not warn with lines-around-comment if multiple scripts", async () => {
    const messages = await execute("simple.html", {
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
    const messages = await execute("fix.html", {
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
    assert.deepStrictEqual(messages[0].fix.range, [53, 55])
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

ifVersion(">= 4.8.0", describe, "reportUnusedDisableDirectives", () => {
  it("reports unused disabled directives", async () => {
    const messages = await execute("inline-disabled-rule.html", {
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
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].line, 2)
    assert.strictEqual(messages[0].column, 3)
    assert.strictEqual(
      messages[0].message,
      "Unused eslint-disable directive (no problems were reported from 'no-eval')."
    )
  })

  it("doesn't report used disabled directives", async () => {
    const messages = await execute("inline-disabled-rule.html", {
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
  const messages = await execute("javascript-mime-types.html", {
    baseConfig: [
      {
        ...DEFAULT_HTML_CONFIG,
        processor: eslintPluginHtmlProcessor({
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
  const messages = await execute("javascript-mime-types.html")
  assert.strictEqual(messages.length, 3)
  assert.strictEqual(messages[0].ruleId, "no-console")
  assert.strictEqual(messages[0].line, 8)
  assert.strictEqual(messages[1].ruleId, "no-console")
  assert.strictEqual(messages[1].line, 12)
  assert.strictEqual(messages[2].ruleId, "no-console")
  assert.strictEqual(messages[2].line, 16)
})

it("specifies a list of valid mime types", async () => {
  const messages = await execute("javascript-mime-types.html", {
    baseConfig: [
      {
        ...DEFAULT_HTML_CONFIG,
        processor: eslintPluginHtmlProcessor({
          rules: [{ match: "[type='text/foo']" }],
        }),
      },
      DEFAULT_JS_CONFIG,
    ],
  })
  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].ruleId, "no-console")
  assert.strictEqual(messages[0].line, 20)
})

it("should report correct eol-last message position", async () => {
  const messages = await execute("eol-last.html", {
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
  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].ruleId, "eol-last")
  assert.strictEqual(messages[0].line, 6)
  assert.strictEqual(messages[0].column, 42)
})

describe("scope sharing", () => {
  const executeWithScopeSharing = (file, jsConfig, htmlConfig) =>
    execute(file, {
      baseConfig: [
        htmlConfig || DEFAULT_HTML_CONFIG,
        SCOPE_SHARING_CONFIG,
        { ...DEFAULT_JS_CONFIG, ...jsConfig },
      ],
    })

  const NOT_YET_DECLARED_MESSAGES = Object.freeze([
    "13:7 no-undef 'varNotYetGloballyDeclared' is not defined.",
    "14:7 no-undef 'letNotYetGloballyDeclared' is not defined.",
    "15:7 no-undef 'functionNotYetGloballyDeclared' is not defined.",
    "16:7 no-undef 'ClassNotYetGloballyDeclared' is not defined.",
    "20:11 no-unused-vars 'varNotYetGloballyDeclared' is assigned a value but never used.",
    "21:11 no-unused-vars 'letNotYetGloballyDeclared' is assigned a value but never used.",
    "22:16 no-unused-vars 'functionNotYetGloballyDeclared' is defined but never used.",
    "23:13 no-unused-vars 'ClassNotYetGloballyDeclared' is defined but never used.",
  ])

  it("should export global variables between script scopes", async () => {
    const messages = await executeWithScopeSharing("scope-sharing.html", {
      rules: {
        "no-undef": "error",
      },
      languageOptions: {
        sourceType: "script",
      },
    })
    assert.strictEqual(messages.length, 4)
    assert.strictEqual(messages[0].line, 13)
    assert.strictEqual(
      messages[0].message,
      "'varNotYetGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[1].line, 14)
    assert.strictEqual(
      messages[1].message,
      "'letNotYetGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[2].line, 15)
    assert.strictEqual(
      messages[2].message,
      "'functionNotYetGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[3].line, 16)
    assert.strictEqual(
      messages[3].message,
      "'ClassNotYetGloballyDeclared' is not defined."
    )
  })

  it("should mark variable as used when the variable is used in another tag", async () => {
    const messages = await executeWithScopeSharing("scope-sharing.html", {
      rules: {
        "no-unused-vars": "error",
      },
      languageOptions: {
        sourceType: "script",
      },
    })
    assert.strictEqual(messages.length, 4)
    assert.strictEqual(messages[0].line, 20)
    assert.strictEqual(
      messages[0].message,
      "'varNotYetGloballyDeclared' is assigned a value but never used."
    )
    assert.strictEqual(messages[1].line, 21)
    assert.strictEqual(
      messages[1].message,
      "'letNotYetGloballyDeclared' is assigned a value but never used."
    )
    assert.strictEqual(messages[2].line, 22)
    assert.strictEqual(
      messages[2].message,
      "'functionNotYetGloballyDeclared' is defined but never used."
    )
    assert.strictEqual(messages[3].line, 23)
    assert.strictEqual(
      messages[3].message,
      "'ClassNotYetGloballyDeclared' is defined but never used."
    )
  })

  it("should not be influenced by the ECMA feature 'globalReturn'", async () => {
    const messages = await executeWithScopeSharing("scope-sharing.html", {
      rules: {
        "no-undef": "error",
        "no-unused-vars": "error",
      },
      languageOptions: {
        sourceType: "script",
        parserOptions: {
          ecmaFeatures: {
            globalReturn: true,
          },
        },
      },
    })
    assert.deepStrictEqual(
      toLocatedMessages(messages),
      NOT_YET_DECLARED_MESSAGES
    )
  })

  it("should share the scope of classic scripts parsed as modules", async () => {
    const messages = await executeWithScopeSharing("scope-sharing.html", {
      rules: {
        "no-undef": "error",
        "no-unused-vars": "error",
      },
      languageOptions: {
        sourceType: "module",
      },
    })
    assert.deepStrictEqual(
      toLocatedMessages(messages),
      NOT_YET_DECLARED_MESSAGES
    )
  })

  it("should not share the global scope between module scripts", async () => {
    const messages = await executeWithScopeSharing(
      "scope-sharing.html",
      {
        rules: {
          "no-undef": "error",
          "no-unused-vars": "error",
        },
      },
      {
        ...DEFAULT_HTML_CONFIG,
        processor: eslintPluginHtmlProcessor({
          rules: [{ match: "script", module: true }],
        }),
      }
    )
    assert.strictEqual(messages.length, 16)
    assert.strictEqual(messages[0].line, 8)
    assert.strictEqual(
      messages[0].message,
      "'varGloballyDeclared' is assigned a value but never used."
    )
    assert.strictEqual(messages[1].line, 9)
    assert.strictEqual(
      messages[1].message,
      "'letGloballyDeclared' is assigned a value but never used."
    )
    assert.strictEqual(messages[2].line, 10)
    assert.strictEqual(
      messages[2].message,
      "'functionGloballyDeclared' is defined but never used."
    )
    assert.strictEqual(messages[3].line, 11)
    assert.strictEqual(
      messages[3].message,
      "'ClassGloballyDeclared' is defined but never used."
    )
    assert.strictEqual(messages[4].line, 13)
    assert.strictEqual(
      messages[4].message,
      "'varNotYetGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[5].line, 14)
    assert.strictEqual(
      messages[5].message,
      "'letNotYetGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[6].line, 15)
    assert.strictEqual(
      messages[6].message,
      "'functionNotYetGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[7].line, 16)
    assert.strictEqual(
      messages[7].message,
      "'ClassNotYetGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[8].line, 20)
    assert.strictEqual(
      messages[8].message,
      "'varNotYetGloballyDeclared' is assigned a value but never used."
    )
    assert.strictEqual(messages[9].line, 21)
    assert.strictEqual(
      messages[9].message,
      "'letNotYetGloballyDeclared' is assigned a value but never used."
    )
    assert.strictEqual(messages[10].line, 22)
    assert.strictEqual(
      messages[10].message,
      "'functionNotYetGloballyDeclared' is defined but never used."
    )
    assert.strictEqual(messages[11].line, 23)
    assert.strictEqual(
      messages[11].message,
      "'ClassNotYetGloballyDeclared' is defined but never used."
    )
    assert.strictEqual(messages[12].line, 25)
    assert.strictEqual(
      messages[12].message,
      "'varGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[13].line, 26)
    assert.strictEqual(
      messages[13].message,
      "'letGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[14].line, 27)
    assert.strictEqual(
      messages[14].message,
      "'functionGloballyDeclared' is not defined."
    )
    assert.strictEqual(messages[15].line, 28)
    assert.strictEqual(
      messages[15].message,
      "'ClassGloballyDeclared' is not defined."
    )
  })

  it("should let module scripts use the globals of previous classic scripts", async () => {
    const messages = await executeWithScopeSharing(
      "scope-sharing-modules.html",
      {
        rules: {
          "no-undef": "error",
          "no-unused-vars": "error",
        },
      }
    )
    assert.deepStrictEqual(toLocatedMessages(messages), [
      "9:11 no-unused-vars 'moduleVariable' is assigned a value but never used.",
      "13:7 no-undef 'moduleVariable' is not defined.",
    ])
  })

  it("should not depend on inline configuration", async () => {
    const messages = await executeWithScopeSharing("scope-sharing.html", {
      rules: {
        "no-undef": "error",
        "no-unused-vars": "error",
      },
      languageOptions: {
        sourceType: "script",
      },
      linterOptions: {
        noInlineConfig: true,
      },
    })
    assert.deepStrictEqual(
      toLocatedMessages(messages),
      NOT_YET_DECLARED_MESSAGES
    )
  })

  it("should not change the code of scripts", async () => {
    const baseConfig = (rules) => [
      DEFAULT_HTML_CONFIG,
      SCOPE_SHARING_CONFIG,
      { ...DEFAULT_JS_CONFIG, rules },
    ]

    assert.deepStrictEqual(
      await executeText(
        "<script>\nvar a = 1\n</script>\n<script>\na\n</script>\n",
        { baseConfig: baseConfig({ "max-lines": ["error", 1] }) }
      ),
      []
    )
    assert.deepStrictEqual(
      toLocatedMessages(
        await executeText(
          "<script>\n\n\nvar a = 1\n</script>\n<script>\na\n</script>\n",
          {
            baseConfig: baseConfig({
              "no-multiple-empty-lines": ["error", { max: 5, maxBOF: 0 }],
            }),
          }
        )
      ),
      [
        "2:1 no-multiple-empty-lines Too many blank lines at the beginning of file. Max of 0 allowed.",
      ]
    )
  })

  it("should parse each script once, with the configured parser", async () => {
    let parseCount = 0
    const countingParser = {
      meta: { name: "counting-espree" },
      parse: (code, options) => {
        parseCount += 1
        return espree.parse(code, options)
      },
    }

    const messages = await executeWithScopeSharing("scope-sharing.html", {
      rules: {
        "no-undef": "error",
        "no-unused-vars": "error",
      },
      languageOptions: {
        sourceType: "script",
        parserOptions: {
          parser: countingParser,
        },
      },
    })
    assert.strictEqual(parseCount, 2)
    assert.deepStrictEqual(
      toLocatedMessages(messages),
      NOT_YET_DECLARED_MESSAGES
    )
  })

  it("should keep sharing the scope of other scripts when one fails to parse", async () => {
    const messages = await executeText(
      "<script>\nvar a = 1\n</script>\n<script>\na(\n</script>\n<script>\na\n</script>\n",
      {
        baseConfig: [
          DEFAULT_HTML_CONFIG,
          SCOPE_SHARING_CONFIG,
          {
            ...DEFAULT_JS_CONFIG,
            rules: {
              "no-undef": "error",
              "no-unused-vars": "error",
            },
            languageOptions: {
              sourceType: "script",
            },
          },
        ],
      }
    )
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].fatal, true)
  })
})

describe("compatibility with external HTML plugins", () => {
  const htmlEslintPlugin = require("@html-eslint/eslint-plugin")
  const HTML_ESLINT_SETUPS = Object.freeze({
    // The `language` option exists since ESLint 9.7
    language: {
      eslintVersion: ">= 9.7",
      config: { language: "@html-eslint/html" },
    },
    parser: {
      eslintVersion: "*",
      config: { languageOptions: { parser: require("@html-eslint/parser") } },
    },
  })
  const isHtmlEslintRule = (name) => name.startsWith("@html-eslint/")
  const pickRules = (rules, predicate) =>
    Object.fromEntries(
      Object.entries(rules).filter(([name]) => predicate(name))
    )

  for (const [
    setupName,
    { eslintVersion: setupEslintVersion, config: htmlEslintSetup },
  ] of Object.entries(HTML_ESLINT_SETUPS)) {
    ifVersion(
      setupEslintVersion,
      describe,
      `with html-eslint's ${setupName}`,
      () => {
        const baseConfig = (rules) => [
          {
            files: ["**/*.html"],
            plugins: {
              "@html-eslint": htmlEslintPlugin,
              html: eslintPluginHtml,
            },
            ...htmlEslintSetup,
            processor: eslintPluginHtmlProcessor({ lintMarkup: true }),
            rules: pickRules(rules, isHtmlEslintRule),
          },
          {
            ...DEFAULT_JS_CONFIG,
            rules: pickRules(rules, (name) => !isHtmlEslintRule(name)),
          },
        ]

        it("check", async () => {
          const messages = await execute(
            "other-html-plugins-compatibility.html",
            {
              baseConfig: baseConfig({
                "@html-eslint/require-img-alt": "error",
                "no-console": "error",
              }),
            }
          )
          assert.deepStrictEqual(toLocatedMessages(messages), [
            "1:1 @html-eslint/require-img-alt Missing `alt` attribute at `<img>` tag",
            "3:3 no-console Unexpected console statement.",
          ])
        })

        it("fix", async () => {
          const result = await execute(
            "other-html-plugins-compatibility.html",
            {
              baseConfig: baseConfig({
                "@html-eslint/quotes": ["error", "single"],
                quotes: ["error", "single"],
              }),
              fix: true,
            }
          )
          assert.deepStrictEqual(
            result.output,
            `\
<img src=''>
<script>
  console.log('toto')
</script>
`
          )
        })

        it("keeps the HTML comments of this plugin", async () => {
          const eslintOptions = {
            baseConfig: [
              ...baseConfig({ "@html-eslint/require-img-alt": "error" }),
              { linterOptions: { reportUnusedDisableDirectives: "error" } },
            ],
          }
          const pluginComments =
            "<!-- eslint-disable -->\n<script>{{ template }}</script>\n<!-- eslint-enable -->\n<!-- eslint-disable-next-script -->\n<script>{{ other }}</script>\n"
          const text = `${pluginComments}<!-- eslint-disable-next-line @html-eslint/require-img-alt -->\n<div></div>\n`

          assert.deepStrictEqual(
            toLocatedMessages(await executeText(text, eslintOptions)),
            [
              "6:5 null Unused eslint-disable directive (no problems were reported from '@html-eslint/require-img-alt').",
            ]
          )
          const { output } = await executeText(text, {
            ...eslintOptions,
            fix: true,
          })
          assert.ok(output.startsWith(pluginComments))

          const textWithBOM =
            "\uFEFF<!-- eslint-disable --><script>{{ template }}</script>\n"
          assert.deepStrictEqual(
            await executeText(textWithBOM, eslintOptions),
            []
          )
        })
      }
    )
  }
})

describe("remapping", () => {
  it("should remap suggestions", async () => {
    const text =
      "<div>\n  <script>\n    console.log(1);\n    foo();\n  </script>\n</div>\n"
    const [message] = await executeText(text)
    const { range, text: replacement } = message.suggestions[0].fix
    assert.strictEqual(
      text.slice(0, range[0]) + replacement + text.slice(range[1]),
      "<div>\n  <script>\n    \n    foo();\n  </script>\n</div>\n"
    )
  })

  it("should remap fixes inserting text at the start of a script", async () => {
    const text = "<div>\n  <script>\n    foo()\n  </script>\n</div>\n"
    const [message] = await executeText(text, {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        { ...DEFAULT_JS_CONFIG, rules: { "unicode-bom": ["error", "always"] } },
      ],
    })
    const start = text.indexOf("foo()")
    assert.deepStrictEqual(message.fix.range, [start, start])
  })

  it("should indent the lines that fixes add like the script", async () => {
    const result = await executeText(
      "<div>\n  <script>\n    const a = {b: 1}\n    foo()\n    bar()\n  </script>\n</div>\n",
      {
        baseConfig: [
          DEFAULT_HTML_CONFIG,
          {
            ...DEFAULT_JS_CONFIG,
            rules: {
              "object-curly-newline": ["error", "always"],
              indent: ["error", 2],
              "padding-line-between-statements": [
                "error",
                { blankLine: "always", prev: "expression", next: "expression" },
              ],
            },
          },
        ],
        fix: true,
      }
    )
    assert.strictEqual(
      result.output,
      "<div>\n  <script>\n    const a = {\n      b: 1\n    }\n    foo()\n\n    bar()\n  </script>\n</div>\n"
    )
  })

  it("should indent a script replaced by a fix like the script", async () => {
    // Replaces the whole script, like formatters do
    const formatted =
      "/**\n * Documented\n */\nfunction foo() {\n  return 1\n}\n"
    const formatPlugin = {
      rules: {
        format: {
          meta: { fixable: "code" },
          create: (context) => ({
            Program: () => {
              const { text } = context.sourceCode
              if (text !== formatted) {
                context.report({
                  loc: { line: 1, column: 0 },
                  message: "Not formatted",
                  fix: (fixer) =>
                    fixer.replaceTextRange([0, text.length], formatted),
                })
              }
            },
          }),
        },
      },
    }

    const result = await executeText(
      "<div>\n  <script>\n    function foo() { return 1 }\n  </script>\n</div>\n",
      {
        baseConfig: [
          DEFAULT_HTML_CONFIG,
          {
            ...DEFAULT_JS_CONFIG,
            plugins: { test: formatPlugin },
            rules: { "test/format": "error" },
          },
        ],
        fix: true,
      }
    )
    assert.strictEqual(
      result.output,
      "<div>\n  <script>\n    /**\n     * Documented\n     */\n    function foo() {\n      return 1\n    }\n  </script>\n</div>\n"
    )
    assert.deepStrictEqual(result.messages, [])
  })
})

it("should lint scripts with the default types only", async () => {
  const messages = await execute("default-script-types.html")
  assert.deepStrictEqual(
    messages.map(({ line }) => line),
    [2, 5, 8, 11, 14]
  )
})

it("should name module scripts so they are linted as modules", async () => {
  const messages = await executeText(
    '<script>\n  var shared = 1\n</script>\n<script type="module">\n  import value from "./value.js"\n  console.log(shared, value)\n</script>\n',
    {
      baseConfig: [
        ...eslintPluginHtml.configs.recommended,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-undef": "error",
            "no-unused-vars": "error",
          },
          languageOptions: {
            globals: { console: "readonly" },
          },
        },
      ],
    }
  )
  assert.deepStrictEqual(messages, [])
})

it("should lint HTML code blocks of Markdown files", async () => {
  const text = [
    "# Title",
    "",
    "```html",
    "<script>",
    "  var shared = 1",
    "</script>",
    "<script>",
    "  console.log(shared, missing)",
    "</script>",
    "```",
    "",
  ].join("\n")
  const messages = await executeText(
    text,
    {
      baseConfig: [
        {
          files: ["**/*.md"],
          plugins: { markdown },
          processor: "markdown/markdown",
        },
        ...eslintPluginHtml.configs.recommended,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-console": "error",
            "no-undef": "error",
            "no-unused-vars": "error",
          },
          languageOptions: {
            globals: { console: "readonly" },
          },
        },
      ],
    },
    "virtual.md"
  )
  assert.deepStrictEqual(toLocatedMessages(messages), [
    "8:3 no-console Unexpected console statement.",
    "8:23 no-undef 'missing' is not defined.",
  ])
})

it("should give processors with different options different cache ids", () => {
  const { version } = eslintPluginHtmlProcessor().meta
  assert.strictEqual(eslintPluginHtmlProcessor().meta.version, version)
  assert.notStrictEqual(
    eslintPluginHtmlProcessor({ reportBadIndent: true }).meta.version,
    version
  )
})
