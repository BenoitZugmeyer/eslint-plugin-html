"use strict"

const path = require("path")
const eslint = require("eslint")
const semver = require("semver")
const { it, describe } = require("node:test")
const assert = require("assert")
const eslintVersion = require("eslint/package.json").version
const eslintPluginHtml = require("..")

function matchVersion(versionSpec) {
  return semver.satisfies(eslintVersion, versionSpec, {
    includePrerelease: true,
  })
}

function ifVersion(versionSpec, fn, ...args) {
  const execFn = matchVersion(versionSpec) ? fn : fn.skip
  execFn(...args)
}

async function execute(file, options = {}) {
  const files = [path.join(__dirname, "fixtures", file)]

  let eslintOptions
  if (matchVersion(">= 9")) {
    eslintOptions = {
      plugins:
        options.usePlugin === false
          ? {}
          : {
              html: eslintPluginHtml,
            },
      baseConfig: {
        files: ["**/*.*"],
        settings: options.settings || {},
        rules: Object.assign(
          {
            "no-console": 2,
          },
          options.rules
        ),
        languageOptions: {
          globals: options.globals || {},
          sourceType: "script",
          parserOptions: options.parserOptions || {},
          ...("parser" in options
            ? {
                parser: options.parser,
              }
            : {}),
        },
        linterOptions: {
          ...("reportUnusedDisableDirective" in options
            ? {
                reportUnusedDisableDirectives:
                  options.reportUnusedDisableDirectives,
              }
            : {}),
        },
        plugins: options.plugins || {},
      },
      ignore: false,
      ignorePatterns: [],
      overrideConfigFile: true,
      fix: options.fix,
    }
  } else {
    eslintOptions = {
      extensions: ["html"],
      baseConfig: {
        settings: options.settings,
        rules: Object.assign(
          {
            "no-console": 2,
          },
          options.rules
        ),
        globals: options.globals,
        env: options.env,
        parserOptions: options.parserOptions,
        parser: options.parser,
        plugins: options.plugins,
      },
      ignore: false,
      useEslintrc: false,
      fix: options.fix,
      reportUnusedDisableDirectives:
        options.reportUnusedDisableDirectives || null,
    }
  }

  let results
  if (eslint.ESLint) {
    const instance = new eslint.ESLint(eslintOptions)
    results = (await instance.lintFiles(files))[0]
  } else if (eslint.CLIEngine) {
    const cli = new eslint.CLIEngine(eslintOptions)
    if (options.plugins) {
      for (const plugin of options.plugins) {
        cli.addPlugin(plugin.split("/")[0], require(plugin))
      }
    }
    results = cli.executeOnFiles(files).results[0]
  } else {
    throw new Error("invalid ESLint dependency")
  }

  return options.fix ? results : results && results.messages
}

it("should extract and remap messages", async () => {
  const messages = await execute("simple.html")
  assert.strictEqual(messages.length, 5)
  const hasEndPosition = messages[0].endLine !== undefined
  assert.strictEqual(messages[0].message, "Unexpected console statement.")
  assert.strictEqual(messages[0].line, 8)
  assert.strictEqual(messages[0].column, 7)
  if (hasEndPosition) {
    assert.strictEqual(messages[0].endLine, 8)
    assert.strictEqual(messages[0].endColumn, 18)
  }
  assert.strictEqual(messages[1].message, "Unexpected console statement.")
  assert.strictEqual(messages[1].line, 14)
  assert.strictEqual(messages[1].column, 7)
  if (hasEndPosition) {
    assert.strictEqual(messages[1].endLine, 14)
    assert.strictEqual(messages[1].endColumn, 18)
  }
  assert.strictEqual(messages[2].message, "Unexpected console statement.")
  assert.strictEqual(messages[2].line, 20)
  assert.strictEqual(messages[2].column, 3)
  if (hasEndPosition) {
    assert.strictEqual(messages[2].endLine, 20)
    assert.strictEqual(messages[2].endColumn, 14)
  }
  assert.strictEqual(messages[3].message, "Unexpected console statement.")
  assert.strictEqual(messages[3].line, 25)
  assert.strictEqual(messages[3].column, 11)
  if (hasEndPosition) {
    assert.strictEqual(messages[3].endLine, 25)
    assert.strictEqual(messages[3].endColumn, 22)
  }
  assert.strictEqual(messages[4].message, "Unexpected console statement.")
  assert.strictEqual(messages[4].line, 28)
  assert.strictEqual(messages[4].column, 13)
  if (hasEndPosition) {
    assert.strictEqual(messages[4].endLine, 28)
    assert.strictEqual(messages[4].endColumn, 24)
  }
})

ifVersion(
  ">= 9",
  it,
  "does not apply the plugin if it is not used in the configuration",
  async () => {
    const messages = await execute("simple.html", {
      usePlugin: false,
      rules: {
        "no-console": "error",
      },
    })
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Parsing error: Unexpected token <")
  }
)

it("should report correct line numbers with crlf newlines", async () => {
  const messages = await execute("crlf-newlines.html")
  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].message, "Unexpected console statement.")
  assert.strictEqual(messages[0].line, 8)
  assert.strictEqual(messages[0].column, 7)
})

describe("html/indent setting", () => {
  it("should automatically compute indent when nothing is specified", async () => {
    const messages = await execute("indent-setting.html", {
      rules: {
        indent: [2, 2],
      },
    })
    assert.strictEqual(messages.length, 0)
  })

  it("should work with a zero absolute indentation descriptor", async () => {
    const messages = await execute("indent-setting.html", {
      rules: {
        indent: [2, 2],
      },

      settings: {
        "html/indent": 0,
      },
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
      rules: {
        indent: [2, 2],
      },

      settings: {
        "html/indent": 2,
      },
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
      rules: {
        indent: [2, 2],
      },

      settings: {
        "html/indent": "+2",
      },
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
        "no-console": 0,
      },
    })
    assert.strictEqual(messages.length, 2)
    assert.strictEqual(
      messages[0].message,
      matchVersion(">= 6")
        ? "This line has a length of 70. Maximum allowed is 35."
        : "Line 1 exceeds the maximum line length of 35."
    )
    assert.strictEqual(messages[0].line, 1)
    assert.strictEqual(messages[0].column, 9)
    assert.strictEqual(
      messages[1].message,
      matchVersion(">= 7.11")
        ? "File has too many lines (6). Maximum allowed is 3."
        : matchVersion(">= 6")
          ? "File has too many lines (7). Maximum allowed is 3."
          : "File must be at most 3 lines long. It's 7 lines long."
    ) // Starting with eslint 7.3, this message is reported at the beginning of the first extra line
    // instead of the beginning of the file.
    if (matchVersion(">= 7.3")) {
      assert.strictEqual(messages[1].line, 4)
      assert.strictEqual(messages[1].column, 1)
    } else {
      assert.strictEqual(messages[1].line, 1)
      assert.strictEqual(messages[1].column, 9)
    }
  })
})

describe("html/report-bad-indent setting", () => {
  it("should report under-indented code with auto indent setting", async () => {
    const messages = await execute("report-bad-indent-setting.html", {
      settings: {
        "html/report-bad-indent": true,
      },
    })
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Bad line indentation.")
    assert.strictEqual(messages[0].line, 10)
    assert.strictEqual(messages[0].column, 1)
  })

  it("should report under-indented code with provided indent setting", async () => {
    const messages = await execute("report-bad-indent-setting.html", {
      settings: {
        "html/report-bad-indent": true,
        "html/indent": "+4",
      },
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

describe("xml support", () => {
  it("consider .html files as HTML", async () => {
    const messages = await execute("cdata.html")
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Parsing error: Unexpected token <")
    assert.strictEqual(messages[0].fatal, true)
    assert.strictEqual(messages[0].line, 10)
    assert.strictEqual(messages[0].column, 7)
  })

  it("consider .js files as JS", async () => {
    const messages = await execute("javascript.js")
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Unexpected console statement.")
    assert.strictEqual(messages[0].line, 1)
    assert.strictEqual(messages[0].column, 1)
  })

  it("can be forced to consider .html files as XML", async () => {
    const messages = await execute("cdata.html", {
      settings: {
        "html/xml-extensions": [".html"],
      },
    })
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Unexpected console statement.")
    assert.strictEqual(messages[0].line, 11)
    assert.strictEqual(messages[0].column, 9)
  })

  it("consider .xhtml files as XML", async () => {
    const messages = await execute("cdata.xhtml")
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Unexpected console statement.")
    assert.strictEqual(messages[0].line, 13)
    assert.strictEqual(messages[0].column, 9)
  })

  it("can be forced to consider .xhtml files as HTML", async () => {
    const messages = await execute("cdata.xhtml", {
      settings: {
        "html/html-extensions": [".xhtml"],
      },
    })
    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].message, "Parsing error: Unexpected token <")
    assert.strictEqual(messages[0].fatal, true)
    assert.strictEqual(messages[0].line, 12)
    assert.strictEqual(messages[0].column, 7)
  })

  it("removes white space at the end of scripts ending with CDATA", async () => {
    const messages = await execute("cdata.xhtml", {
      rules: {
        "no-console": "off",
        "no-trailing-spaces": "error",
        "eol-last": "error",
      },
    })
    assert.strictEqual(messages.length, 0)
  })

  it("should support self closing script tags", async () => {
    const messages = await execute("self-closing-tags.xhtml")
    assert.deepStrictEqual(messages, [])
  })
})

describe("lines-around-comment and multiple scripts", () => {
  it("should not warn with lines-around-comment if multiple scripts", async () => {
    const messages = await execute("simple.html", {
      rules: {
        "lines-around-comment": [
          "error",
          {
            beforeLineComment: true,
          },
        ],
      },
    })
    assert.strictEqual(messages.length, 5)
  })
})

describe("fix", () => {
  it("should remap fix ranges", async () => {
    const messages = await execute("fix.html", {
      rules: {
        "no-extra-semi": ["error"],
      },
    })
    assert.deepStrictEqual(messages[0].fix.range, [53, 55])
  })

  it("should fix errors", async () => {
    const result = await execute("fix.html", {
      rules: {
        "no-extra-semi": ["error"],
      },
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
      rules: {
        "no-extra-semi": ["error"],
      },
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
        rules: {
          "eol-last": ["error"],
          "no-extra-semi": ["error"],
        },
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
        rules: {
          "eol-last": ["error", "never"],
        },
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
      reportUnusedDisableDirectives: "error",
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
      reportUnusedDisableDirectives: "error",
      rules: {
        "no-eval": 2,
      },
    })
    assert.strictEqual(messages.length, 0)
  })
})

describe("html/ignore-tags-without-type", () => {
  it("ignores tags without type attribute", async () => {
    const messages = await execute("javascript-mime-types.html", {
      settings: {
        "html/ignore-tags-without-type": true,
      },
    })
    assert.strictEqual(messages.length, 2)
  })
})

describe("html/javascript-mime-types", () => {
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
      settings: {
        "html/javascript-mime-types": ["text/foo"],
      },
    })
    assert.strictEqual(messages.length, 2)
    assert.strictEqual(messages[0].ruleId, "no-console")
    assert.strictEqual(messages[0].line, 8)
    assert.strictEqual(messages[1].ruleId, "no-console")
    assert.strictEqual(messages[1].line, 20)
  })

  it("specifies a regexp of valid mime types", async () => {
    const messages = await execute("javascript-mime-types.html", {
      settings: {
        "html/javascript-mime-types": "/^(application|text)/foo$/",
      },
    })
    assert.strictEqual(messages.length, 3)
    assert.strictEqual(messages[0].ruleId, "no-console")
    assert.strictEqual(messages[0].line, 8)
    assert.strictEqual(messages[1].ruleId, "no-console")
    assert.strictEqual(messages[1].line, 20)
    assert.strictEqual(messages[2].ruleId, "no-console")
    assert.strictEqual(messages[2].line, 24)
  })
})

it("should report correct eol-last message position", async () => {
  const messages = await execute("eol-last.html", {
    rules: {
      "eol-last": "error",
    },
  })
  assert.strictEqual(messages.length, 1)
  assert.strictEqual(messages[0].ruleId, "eol-last")
  assert.strictEqual(messages[0].line, 6)
  assert.strictEqual(messages[0].column, 42)
})

describe("scope sharing", () => {
  it("should export global variables between script scopes", async () => {
    const messages = await execute("scope-sharing.html", {
      rules: {
        "no-console": "off",
        "no-undef": "error",
      },
      globals: {
        console: false,
      },
      env: {
        es6: true,
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
    const messages = await execute("scope-sharing.html", {
      rules: {
        "no-console": "off",
        "no-unused-vars": "error",
      },
      globals: {
        console: false,
      },
      env: {
        es6: true,
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
    const messages = await execute("scope-sharing.html", {
      rules: {
        "no-console": "off",
        "no-undef": "error",
        "no-unused-vars": "error",
      },
      globals: {
        console: false,
      },
      env: {
        es6: true,
      },
      parserOptions: {
        ecmaFeatures: {
          globalReturn: true,
        },
      },
    })
    assert.strictEqual(messages.length, 8)
  })

  it("should not share the global scope if sourceType is 'module'", async () => {
    const messages = await execute("scope-sharing.html", {
      rules: {
        "no-console": "off",
        "no-undef": "error",
        "no-unused-vars": "error",
      },
      globals: {
        console: false,
      },
      env: {
        es6: true,
      },
      parserOptions: {
        sourceType: "module",
      },
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
ifVersion(">= 5", describe, "compatibility with external HTML plugins", () => {
  const BASE_HTML_ESLINT_CONFIG = matchVersion(">= 9")
    ? {
        plugins: {
          "@html-eslint": require("@html-eslint/eslint-plugin"),
        },
        parser: require("@html-eslint/parser"),
      }
    : {
        plugins: ["@html-eslint/eslint-plugin"],
        parser: "@html-eslint/parser",
      }

  it("check", async () => {
    const messages = await execute("other-html-plugins-compatibility.html", {
      ...BASE_HTML_ESLINT_CONFIG,
      rules: {
        "@html-eslint/require-img-alt": ["error"],
      },
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
})
