import * as eslint from "eslint"
import * as semver from "semver"
import { it, describe } from "node:test"
import * as assert from "node:assert"
import { createRequire } from "node:module"

import eslintPluginHtml, {
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
    await instance.lintFiles([
      new URL(`fixtures/${file}`, import.meta.url).pathname,
    ])
  )[0]

  return eslintOptions.fix ? results : results && results.messages
}

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
  it("should export global variables between script scopes", async () => {
    const messages = await execute("scope-sharing.html", {
      baseConfig: [
        DEFAULT_HTML_CONFIG,
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-undef": "error",
          },
          languageOptions: {
            sourceType: "script",
          },
        },
      ],
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
    const messages = await execute("scope-sharing.html", {
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

  it("ECMA feature 'globalReturn'", async () => {
    const messages = await execute("scope-sharing.html", {
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
    assert.strictEqual(messages.length, 12)
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
  })

  it.only("should not share the global scope if sourceType is 'module'", async () => {
    const messages = await execute("scope-sharing.html", {
      baseConfig: [
        {
          ...DEFAULT_HTML_CONFIG,
          processor: eslintPluginHtmlProcessor({
            rules: [{ match: "script", module: true }],
          }),
        },
        {
          ...DEFAULT_JS_CONFIG,
          rules: {
            "no-undef": "error",
            "no-unused-vars": "error",
          },
          languageOptions: {
            sourceType: "module",
          },
        },
      ],
    })
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
})

// For some reason @html-eslint is not compatible with ESLint < 5
ifVersion(
  ">= 5",
  describe.only,
  "compatibility with external HTML plugins",
  () => {
    const BASE_HTML_ESLINT_CONFIG = {
      plugins: {
        "@html-eslint": require("@html-eslint/eslint-plugin"),
        html: eslintPluginHtml,
      },
      parser: require("@html-eslint/parser"),
    }

    it.only("check", async () => {
      const messages = await execute("other-html-plugins-compatibility.html", {
        baseConfig: [
          {
            files: ["**/*.html"],
            //...DEFAULT_HTML_CONFIG,
            plugins: {
              //...DEFAULT_HTML_CONFIG.plugins,
              "@html-eslint": require("@html-eslint/eslint-plugin"),
            },
            language: "@html-eslint/html",
            rules: {
              "@html-eslint/require-img-alt": "error",
            },
          },
          DEFAULT_HTML_CONFIG,
          DEFAULT_JS_CONFIG,
        ],
      })
      assert.deepStrictEqual(
        messages.map((message) => ({
          ...message,

          // ESLint v8.54.0 adds suggestions for the no-console rule. As we are running tests on older
          // versions of ESLint, we need to ignore these suggestions.
          suggestions: "(ignored)",
        })),
        [
          {
            column: 1,
            endColumn: 13,
            endLine: 1,
            line: 1,
            message: "Missing `alt` attribute at `<img>` tag",
            messageId: "missingAlt",
            nodeType: null,
            ruleId: "@html-eslint/require-img-alt",
            severity: 2,
            suggestions: "(ignored)",
          },
          {
            column: 3,
            endColumn: 14,
            endLine: 3,
            line: 3,
            message: "Unexpected console statement.",
            messageId: "unexpected",
            nodeType: "MemberExpression",
            ruleId: "no-console",
            severity: 2,
            source: '  console.log("toto")',
            suggestions: "(ignored)",
          },
        ]
      )
    })

    it("fix", async () => {
      const result = await execute("other-html-plugins-compatibility.html", {
        baseConfig: [
          {
            files: ["**/*.html"],

            //TODO
          },
        ],
        ...BASE_HTML_ESLINT_CONFIG,
        rules: {
          "@html-eslint/quotes": ["error", "single"],
          quotes: ["error", "single"],
        },
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
    })
  }
)
