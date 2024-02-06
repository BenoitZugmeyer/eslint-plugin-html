const getSettings = require("./settings").getSettings
const getFileMode = require("./getFileMode")
const extract = require("./extract")
const { splatSet } = require("./utils")
const { remapMessages } = require("./remapMessages")

const PREPARE_RULE_NAME = "__eslint-plugin-html-prepare"

module.exports = { createVerifyPatch }

function createVerifyPatch(verify) {
  return function (textOrSourceCode, config, filenameOrOptions, saveState) {
    const callOriginalVerify = () =>
      verify.call(this, textOrSourceCode, config, filenameOrOptions, saveState)

    if (typeof config.extractConfig === "function") {
      return callOriginalVerify()
    }

    const pluginSettings = getSettings(config.settings || {})
    const mode = getFileMode(pluginSettings, filenameOrOptions)

    if (!mode || typeof textOrSourceCode !== "string") {
      return callOriginalVerify()
    }

    let messages
    ;[messages, config] = verifyExternalHtmlPlugin(config, callOriginalVerify)

    if (config.parser && config.parser.id === "@html-eslint/parser") {
      messages.push(...callOriginalVerify())
      const rules = {}
      for (const name in config.rules) {
        if (!name.startsWith("@html-eslint/")) {
          rules[name] = config.rules[name]
        }
      }
      config = editConfig(config, {
        parser: null,
        rules,
      })
    }

    const extractResult = extract(
      textOrSourceCode,
      pluginSettings.indent,
      mode === "xml",
      pluginSettings.javaScriptTagNames,
      pluginSettings.isJavaScriptMIMEType
    )

    if (pluginSettings.reportBadIndent) {
      messages.push(
        ...extractResult.badIndentationLines.map((line) => ({
          message: "Bad line indentation.",
          line,
          column: 1,
          ruleId: "(html plugin)",
          severity: pluginSettings.reportBadIndent,
        }))
      )
    }

    // Save code parts parsed source code so we don't have to parse it twice
    const sourceCodes = new WeakMap()
    const verifyCodePart = (codePart, { prepare, ignoreRules } = {}) => {
      this.defineRule(PREPARE_RULE_NAME, (context) => {
        sourceCodes.set(codePart, context.getSourceCode())
        return {
          Program() {
            if (prepare) {
              prepare(context)
            }
          },
        }
      })

      const localMessages = verify.call(
        this,
        sourceCodes.get(codePart) || String(codePart),
        editConfig(config, {
          rules: Object.assign(
            { [PREPARE_RULE_NAME]: "error" },
            !ignoreRules && config.rules
          ),
        }),
        ignoreRules && typeof filenameOrOptions === "object"
          ? Object.assign({}, filenameOrOptions, {
              reportUnusedDisableDirectives: false,
            })
          : filenameOrOptions,
        saveState
      )

      messages.push(
        ...remapMessages(localMessages, extractResult.hasBOM, codePart)
      )
    }

    const parserOptions = config.parserOptions || {}
    if (parserOptions.sourceType === "module") {
      for (const codePart of extractResult.code) {
        verifyCodePart(codePart)
      }
    } else {
      verifyWithSharedScopes(extractResult.code, verifyCodePart, parserOptions)
    }

    messages.sort((ma, mb) => ma.line - mb.line || ma.column - mb.column)

    return messages
  }
}

function editConfig(config, { parser = config.parser, rules = config.rules }) {
  return {
    ...config,
    parser,
    rules,
  }
}

const externalHtmlPluginPrefixes = [
  "@html-eslint/",
  "@angular-eslint/template-",
]

function getParserId(config) {
  if (!config.parser) {
    return
  }

  if (typeof config.parser === "string") {
    // old versions of ESLint (ex: 4.7)
    return config.parser
  }

  return config.parser.id
}

function verifyExternalHtmlPlugin(config, callOriginalVerify) {
  const parserId = getParserId(config)
  const externalHtmlPluginPrefix =
    parserId &&
    externalHtmlPluginPrefixes.find((prefix) => parserId.startsWith(prefix))
  if (!externalHtmlPluginPrefix) {
    return [[], config]
  }

  const rules = {}
  for (const name in config.rules) {
    if (!name.startsWith(externalHtmlPluginPrefix)) {
      rules[name] = config.rules[name]
    }
  }

  return [
    callOriginalVerify(),
    editConfig(config, {
      parser: null,
      rules,
    }),
  ]
}

function verifyWithSharedScopes(codeParts, verifyCodePart, parserOptions) {
  // First pass: collect needed globals and declared globals for each script tags.
  const firstPassValues = []

  for (const codePart of codeParts) {
    verifyCodePart(codePart, {
      prepare(context) {
        const globalScope = context.getScope()
        // See https://github.com/eslint/eslint/blob/4b267a5c8a42477bb2384f33b20083ff17ad578c/lib/rules/no-redeclare.js#L67-L78
        let scopeForDeclaredGlobals
        if (
          parserOptions.ecmaFeatures &&
          parserOptions.ecmaFeatures.globalReturn
        ) {
          scopeForDeclaredGlobals = globalScope.childScopes[0]
        } else {
          scopeForDeclaredGlobals = globalScope
        }

        firstPassValues.push({
          codePart,
          exportedGlobals: globalScope.through.map(
            (node) => node.identifier.name
          ),
          declaredGlobals: scopeForDeclaredGlobals.variables.map(
            (variable) => variable.name
          ),
        })
      },
      ignoreRules: true,
    })
  }

  // Second pass: declare variables for each script scope, then run eslint.
  for (let i = 0; i < firstPassValues.length; i += 1) {
    verifyCodePart(firstPassValues[i].codePart, {
      prepare(context) {
        const exportedGlobals = splatSet(
          firstPassValues
            .slice(i + 1)
            .map((nextValues) => nextValues.exportedGlobals)
        )
        for (const name of exportedGlobals) context.markVariableAsUsed(name)

        const declaredGlobals = splatSet(
          firstPassValues
            .slice(0, i)
            .map((previousValues) => previousValues.declaredGlobals)
        )
        const scope = context.getScope()
        scope.through = scope.through.filter((variable) => {
          return !declaredGlobals.has(variable.identifier.name)
        })
      },
    })
  }
}
