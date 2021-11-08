"use strict"

const path = require("path")
const eslint = require("eslint")
const semver = require("semver")
const eslintVersion = require("eslint/package.json").version
const plugin = require("..")

function matchVersion(versionSpec) {
  return semver.satisfies(eslintVersion, versionSpec, {
    includePrerelease: true,
  })
}

function ifVersion(versionSpec, fn, ...args) {
  const execFn = matchVersion(versionSpec) ? fn : fn.skip
  execFn(...args)
}

async function execute(file, baseConfig) {
  if (!baseConfig) baseConfig = {}

  const files = [path.join(__dirname, "fixtures", file)]

  const options = {
    extensions: ["html"],
    baseConfig: {
      settings: baseConfig.settings,
      rules: Object.assign(
        {
          "no-console": 2,
        },
        baseConfig.rules
      ),
      globals: baseConfig.globals,
      env: baseConfig.env,
      parserOptions: baseConfig.parserOptions,
    },
    ignore: false,
    useEslintrc: false,
    fix: baseConfig.fix,
    reportUnusedDisableDirectives:
      baseConfig.reportUnusedDisableDirectives || null,
  }

  let results
  if (eslint.ESLint) {
    const instance = new eslint.ESLint({
      ...options,
      plugins: { html: plugin },
    })
    results = (await instance.lintFiles(files))[0]
  } else if (eslint.CLIEngine) {
    const cli = new eslint.CLIEngine(options)
    cli.addPlugin("html", plugin)
    results = cli.executeOnFiles(files).results[0]
  } else {
    throw new Error("invalid ESLint dependency")
  }

  return baseConfig.fix ? results : results && results.messages
}

it("should extract and remap messages", async () => {
  const messages = await execute("simple.html")

  expect(messages.length).toBe(5)

  const hasEndPosition = messages[0].endLine !== undefined

  expect(messages[0].message).toBe("Unexpected console statement.")
  expect(messages[0].line).toBe(8)
  expect(messages[0].column).toBe(7)
  if (hasEndPosition) {
    expect(messages[0].endLine).toBe(8)
    expect(messages[0].endColumn).toBe(18)
  }

  expect(messages[1].message).toBe("Unexpected console statement.")
  expect(messages[1].line).toBe(14)
  expect(messages[1].column).toBe(7)
  if (hasEndPosition) {
    expect(messages[1].endLine).toBe(14)
    expect(messages[1].endColumn).toBe(18)
  }

  expect(messages[2].message).toBe("Unexpected console statement.")
  expect(messages[2].line).toBe(20)
  expect(messages[2].column).toBe(3)
  if (hasEndPosition) {
    expect(messages[2].endLine).toBe(20)
    expect(messages[2].endColumn).toBe(14)
  }

  expect(messages[3].message).toBe("Unexpected console statement.")
  expect(messages[3].line).toBe(25)
  expect(messages[3].column).toBe(11)
  if (hasEndPosition) {
    expect(messages[3].endLine).toBe(25)
    expect(messages[3].endColumn).toBe(22)
  }

  expect(messages[4].message).toBe("Unexpected console statement.")
  expect(messages[4].line).toBe(28)
  expect(messages[4].column).toBe(13)
  if (hasEndPosition) {
    expect(messages[4].endLine).toBe(28)
    expect(messages[4].endColumn).toBe(24)
  }
})

it("should report correct line numbers with crlf newlines", async () => {
  const messages = await execute("crlf-newlines.html")

  expect(messages.length).toBe(1)

  expect(messages[0].message).toBe("Unexpected console statement.")
  expect(messages[0].line).toBe(8)
  expect(messages[0].column).toBe(7)
})

describe("html/indent setting", () => {
  it("should automatically compute indent when nothing is specified", async () => {
    const messages = await execute("indent-setting.html", {
      rules: {
        indent: [2, 2],
      },
    })

    expect(messages.length).toBe(0)
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

    expect(messages.length).toBe(9)

    // Only the first script is correctly indented (aligned on the first column)

    expect(messages[0].message).toMatch(
      /Expected indentation of 0 .* but found 2\./
    )
    expect(messages[0].line).toBe(16)

    expect(messages[1].message).toMatch(
      /Expected indentation of 2 .* but found 4\./
    )
    expect(messages[1].line).toBe(17)

    expect(messages[2].message).toMatch(
      /Expected indentation of 0 .* but found 2\./
    )
    expect(messages[2].line).toBe(18)

    expect(messages[3].message).toMatch(
      /Expected indentation of 0 .* but found 6\./
    )
    expect(messages[3].line).toBe(22)

    expect(messages[4].message).toMatch(
      /Expected indentation of 2 .* but found 8\./
    )
    expect(messages[4].line).toBe(23)

    expect(messages[5].message).toMatch(
      /Expected indentation of 0 .* but found 6\./
    )
    expect(messages[5].line).toBe(24)

    expect(messages[6].message).toMatch(
      /Expected indentation of 0 .* but found 10\./
    )
    expect(messages[6].line).toBe(28)

    expect(messages[7].message).toMatch(
      /Expected indentation of 2 .* but found 12\./
    )
    expect(messages[7].line).toBe(29)

    expect(messages[8].message).toMatch(
      /Expected indentation of 0 .* but found 10\./
    )
    expect(messages[8].line).toBe(30)
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

    expect(messages.length).toBe(7)

    // The first script is incorrect since the second line gets dedented
    expect(messages[0].message).toMatch(
      /Expected indentation of 2 .* but found 0\./
    )
    expect(messages[0].line).toBe(11)

    // The second script is correct.

    expect(messages[1].message).toMatch(
      /Expected indentation of 0 .* but found 6\./
    )
    expect(messages[1].line).toBe(22)

    expect(messages[2].message).toMatch(
      /Expected indentation of .* but found 6\./
    )
    expect(messages[2].line).toBe(23)

    expect(messages[3].message).toMatch(
      /Expected indentation of .* but found 4\./
    )
    expect(messages[3].line).toBe(24)

    expect(messages[4].message).toMatch(
      /Expected indentation of 0 .* but found 10\./
    )
    expect(messages[4].line).toBe(28)

    expect(messages[5].message).toMatch(
      /Expected indentation of .* but found 10\./
    )
    expect(messages[5].line).toBe(29)

    expect(messages[6].message).toMatch(
      /Expected indentation of .* but found 8\./
    )
    expect(messages[6].line).toBe(30)
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

    expect(messages.length).toBe(6)

    // The first script is correct since it can't be dedented, but follows the indent
    // rule anyway.

    expect(messages[0].message).toMatch(
      /Expected indentation of 0 .* but found 2\./
    )
    expect(messages[0].line).toBe(16)

    expect(messages[1].message).toMatch(
      /Expected indentation of 2 .* but found 4\./
    )
    expect(messages[1].line).toBe(17)

    expect(messages[2].message).toMatch(
      /Expected indentation of 0 .* but found 2\./
    )
    expect(messages[2].line).toBe(18)

    // The third script is correct.

    expect(messages[3].message).toMatch(
      /Expected indentation of 0 .* but found 10\./
    )
    expect(messages[3].line).toBe(28)

    expect(messages[4].message).toMatch(
      /Expected indentation of 2 .* but found 4\./
    )
    expect(messages[4].line).toBe(29)

    expect(messages[5].message).toMatch(
      /Expected indentation of 0 .* but found 2\./
    )
    expect(messages[5].line).toBe(30)
  })

  it("should report messages at the beginning of the file", async () => {
    const messages = await execute("error-at-the-beginning.html", {
      rules: {
        "max-lines": [2, { max: 3 }],
        "max-len": [2, { code: 35 }],
        "no-console": 0,
      },
    })

    expect(messages.length).toBe(2)

    expect(messages[0].message).toBe(
      matchVersion(">= 6")
        ? "This line has a length of 70. Maximum allowed is 35."
        : "Line 1 exceeds the maximum line length of 35."
    )
    expect(messages[0].line).toBe(1)
    expect(messages[0].column).toBe(9)

    expect(messages[1].message).toBe(
      matchVersion(">= 7.11")
        ? "File has too many lines (6). Maximum allowed is 3."
        : matchVersion(">= 6")
        ? "File has too many lines (7). Maximum allowed is 3."
        : "File must be at most 3 lines long. It's 7 lines long."
    )
    // Starting with eslint 7.3, this message is reported at the beginning of the first extra line
    // instead of the beginning of the file.
    if (matchVersion(">= 7.3")) {
      expect(messages[1].line).toBe(4)
      expect(messages[1].column).toBe(1)
    } else {
      expect(messages[1].line).toBe(1)
      expect(messages[1].column).toBe(9)
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

    expect(messages.length).toBe(1)

    expect(messages[0].message).toBe("Bad line indentation.")
    expect(messages[0].line).toBe(10)
    expect(messages[0].column).toBe(1)
  })

  it("should report under-indented code with provided indent setting", async () => {
    const messages = await execute("report-bad-indent-setting.html", {
      settings: {
        "html/report-bad-indent": true,
        "html/indent": "+4",
      },
    })

    expect(messages.length).toBe(3)

    expect(messages[0].message).toBe("Bad line indentation.")
    expect(messages[0].line).toBe(9)
    expect(messages[0].column).toBe(1)

    expect(messages[1].message).toBe("Bad line indentation.")
    expect(messages[1].line).toBe(10)
    expect(messages[1].column).toBe(1)

    expect(messages[2].message).toBe("Bad line indentation.")
    expect(messages[2].line).toBe(11)
    expect(messages[2].column).toBe(1)
  })
})

describe("xml support", () => {
  it("consider .html files as HTML", async () => {
    const messages = await execute("cdata.html")

    expect(messages.length).toBe(1)

    expect(messages[0].message).toBe("Parsing error: Unexpected token <")
    expect(messages[0].fatal).toBe(true)
    expect(messages[0].line).toBe(10)
    expect(messages[0].column).toBe(7)
  })

  it("can be forced to consider .html files as XML", async () => {
    const messages = await execute("cdata.html", {
      settings: {
        "html/xml-extensions": [".html"],
      },
    })

    expect(messages.length).toBe(1)

    expect(messages[0].message).toBe("Unexpected console statement.")
    expect(messages[0].line).toBe(11)
    expect(messages[0].column).toBe(9)
  })

  it("consider .xhtml files as XML", async () => {
    const messages = await execute("cdata.xhtml")

    expect(messages.length).toBe(1)

    expect(messages[0].message).toBe("Unexpected console statement.")
    expect(messages[0].line).toBe(13)
    expect(messages[0].column).toBe(9)
  })

  it("can be forced to consider .xhtml files as HTML", async () => {
    const messages = await execute("cdata.xhtml", {
      settings: {
        "html/html-extensions": [".xhtml"],
      },
    })

    expect(messages.length).toBe(1)

    expect(messages[0].message).toBe("Parsing error: Unexpected token <")
    expect(messages[0].fatal).toBe(true)
    expect(messages[0].line).toBe(12)
    expect(messages[0].column).toBe(7)
  })

  it("removes white space at the end of scripts ending with CDATA", async () => {
    const messages = await execute("cdata.xhtml", {
      rules: {
        "no-console": "off",
        "no-trailing-spaces": "error",
        "eol-last": "error",
      },
    })

    expect(messages.length).toBe(0)
  })

  it("should support self closing script tags", async () => {
    const messages = execute("self-closing-tags.xhtml")
    await expect(messages).resolves.toEqual([])
  })
})

describe("lines-around-comment and multiple scripts", () => {
  it("should not warn with lines-around-comment if multiple scripts", async () => {
    const messages = await execute("simple.html", {
      rules: {
        "lines-around-comment": ["error", { beforeLineComment: true }],
      },
    })

    expect(messages.length).toBe(5)
  })
})

describe("fix", () => {
  it("should remap fix ranges", async () => {
    const messages = await execute("fix.html", {
      rules: {
        "no-extra-semi": ["error"],
      },
    })

    expect(messages[0].fix.range).toEqual([53, 55])
  })

  it("should fix errors", async () => {
    const result = await execute("fix.html", {
      rules: {
        "no-extra-semi": ["error"],
      },
      fix: true,
    })

    expect(result.output).toBe(`<!DOCTYPE html>
<html lang="en">
  <script>
    foo();
  </script>
</html>
`)
    expect(result.messages.length).toBe(0)
  })

  it("should fix errors in files with BOM", async () => {
    const result = await execute("fix-bom.html", {
      rules: {
        "no-extra-semi": ["error"],
      },
      fix: true,
    })

    expect(result.output).toBe(`\uFEFF<!DOCTYPE html>
<html lang="en">
  <script>
    foo();
  </script>
</html>
`)
    expect(result.messages.length).toBe(0)
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

      expect(result.output).toBe(`<!DOCTYPE html>
<html lang="en">
  <script>
    foo();
  </script>
</html>
`)
      expect(result.messages.length).toBe(0)
    })

    it("should work with eol-last never", async () => {
      const result = await execute("fix.html", {
        rules: {
          "eol-last": ["error", "never"],
        },
        fix: true,
      })

      expect(result.output).toBe(`<!DOCTYPE html>
<html lang="en">
  <script>
    foo();;  </script>
</html>
`)
      expect(result.messages.length).toBe(0)
    })
  })
})

ifVersion(">= 4.8.0", describe, "reportUnusedDisableDirectives", () => {
  it("reports unused disabled directives", async () => {
    const messages = await execute("inline-disabled-rule.html", {
      reportUnusedDisableDirectives: "error",
    })

    expect(messages.length).toBe(1)
    expect(messages[0].line).toBe(2)
    expect(messages[0].column).toBe(3)
    expect(messages[0].message).toBe(
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

    expect(messages.length).toBe(0)
  })
})

describe("html/javascript-mime-types", () => {
  it("ignores unknown mime types by default", async () => {
    const messages = await execute("javascript-mime-types.html")

    expect(messages.length).toBe(3)

    expect(messages[0].ruleId).toBe("no-console")
    expect(messages[0].line).toBe(8)

    expect(messages[1].ruleId).toBe("no-console")
    expect(messages[1].line).toBe(12)

    expect(messages[2].ruleId).toBe("no-console")
    expect(messages[2].line).toBe(16)
  })

  it("specifies a list of valid mime types", async () => {
    const messages = await execute("javascript-mime-types.html", {
      settings: {
        "html/javascript-mime-types": ["text/foo"],
      },
    })

    expect(messages.length).toBe(2)

    expect(messages[0].ruleId).toBe("no-console")
    expect(messages[0].line).toBe(8)

    expect(messages[1].ruleId).toBe("no-console")
    expect(messages[1].line).toBe(20)
  })

  it("specifies a regexp of valid mime types", async () => {
    const messages = await execute("javascript-mime-types.html", {
      settings: {
        "html/javascript-mime-types": "/^(application|text)/foo$/",
      },
    })

    expect(messages.length).toBe(3)

    expect(messages[0].ruleId).toBe("no-console")
    expect(messages[0].line).toBe(8)

    expect(messages[1].ruleId).toBe("no-console")
    expect(messages[1].line).toBe(20)

    expect(messages[2].ruleId).toBe("no-console")
    expect(messages[2].line).toBe(24)
  })
})

it("should report correct eol-last message position", async () => {
  const messages = await execute("eol-last.html", {
    rules: {
      "eol-last": "error",
    },
  })

  expect(messages.length).toBe(1)

  expect(messages[0].ruleId).toBe("eol-last")
  expect(messages[0].line).toBe(6)
  expect(messages[0].column).toBe(42)
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
      env: { es6: true },
    })

    expect(messages.length).toBe(4)
    expect(messages[0].line).toBe(13)
    expect(messages[0].message).toBe(
      "'varNotYetGloballyDeclared' is not defined."
    )
    expect(messages[1].line).toBe(14)
    expect(messages[1].message).toBe(
      "'letNotYetGloballyDeclared' is not defined."
    )
    expect(messages[2].line).toBe(15)
    expect(messages[2].message).toBe(
      "'functionNotYetGloballyDeclared' is not defined."
    )
    expect(messages[3].line).toBe(16)
    expect(messages[3].message).toBe(
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
      env: { es6: true },
    })

    expect(messages.length).toBe(4)
    expect(messages[0].line).toBe(20)
    expect(messages[0].message).toBe(
      "'varNotYetGloballyDeclared' is assigned a value but never used."
    )
    expect(messages[1].line).toBe(21)
    expect(messages[1].message).toBe(
      "'letNotYetGloballyDeclared' is assigned a value but never used."
    )
    expect(messages[2].line).toBe(22)
    expect(messages[2].message).toBe(
      "'functionNotYetGloballyDeclared' is defined but never used."
    )
    expect(messages[3].line).toBe(23)
    expect(messages[3].message).toBe(
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
      env: { es6: true },
      parserOptions: {
        ecmaFeatures: {
          globalReturn: true,
        },
      },
    })

    expect(messages.length).toBe(8)
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
      env: { es6: true },
      parserOptions: {
        sourceType: "module",
      },
    })

    expect(messages.length).toBe(16)
    expect(messages[0].line).toBe(8)
    expect(messages[0].message).toBe(
      "'varGloballyDeclared' is assigned a value but never used."
    )
    expect(messages[1].line).toBe(9)
    expect(messages[1].message).toBe(
      "'letGloballyDeclared' is assigned a value but never used."
    )
    expect(messages[2].line).toBe(10)
    expect(messages[2].message).toBe(
      "'functionGloballyDeclared' is defined but never used."
    )
    expect(messages[3].line).toBe(11)
    expect(messages[3].message).toBe(
      "'ClassGloballyDeclared' is defined but never used."
    )
    expect(messages[4].line).toBe(13)
    expect(messages[4].message).toBe(
      "'varNotYetGloballyDeclared' is not defined."
    )
    expect(messages[5].line).toBe(14)
    expect(messages[5].message).toBe(
      "'letNotYetGloballyDeclared' is not defined."
    )
    expect(messages[6].line).toBe(15)
    expect(messages[6].message).toBe(
      "'functionNotYetGloballyDeclared' is not defined."
    )
    expect(messages[7].line).toBe(16)
    expect(messages[7].message).toBe(
      "'ClassNotYetGloballyDeclared' is not defined."
    )

    expect(messages[8].line).toBe(20)
    expect(messages[8].message).toBe(
      "'varNotYetGloballyDeclared' is assigned a value but never used."
    )
    expect(messages[9].line).toBe(21)
    expect(messages[9].message).toBe(
      "'letNotYetGloballyDeclared' is assigned a value but never used."
    )
    expect(messages[10].line).toBe(22)
    expect(messages[10].message).toBe(
      "'functionNotYetGloballyDeclared' is defined but never used."
    )
    expect(messages[11].line).toBe(23)
    expect(messages[11].message).toBe(
      "'ClassNotYetGloballyDeclared' is defined but never used."
    )
    expect(messages[12].line).toBe(25)
    expect(messages[12].message).toBe("'varGloballyDeclared' is not defined.")
    expect(messages[13].line).toBe(26)
    expect(messages[13].message).toBe("'letGloballyDeclared' is not defined.")
    expect(messages[14].line).toBe(27)
    expect(messages[14].message).toBe(
      "'functionGloballyDeclared' is not defined."
    )
    expect(messages[15].line).toBe(28)
    expect(messages[15].message).toBe("'ClassGloballyDeclared' is not defined.")
  })
})
