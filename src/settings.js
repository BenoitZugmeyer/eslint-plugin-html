"use strict"

const oneLine = require("./utils").oneLine

const defaultHTMLExtensions = [
  ".erb",
  ".handlebars",
  ".hbs",
  ".htm",
  ".html",
  ".mustache",
  ".nunjucks",
  ".php",
  ".tag",
  ".twig",
  ".vue",
  ".we",
]

const defaultXMLExtensions = [".xhtml", ".xml"]

function filterOut(array, excludeArray) {
  if (!excludeArray) return array
  return array.filter((item) => excludeArray.indexOf(item) < 0)
}

function compileRegExp(re) {
  const tokens = re.split("/")
  if (tokens.shift()) {
    // Ignore first token
    throw new Error(`Invalid regexp: ${re}`)
  }
  const flags = tokens.pop()
  return new RegExp(tokens.join("/"), flags)
}

function getSettings(settings) {
  const htmlExtensions =
    settings["html/html-extensions"] ||
    filterOut(defaultHTMLExtensions, settings["html/xml-extensions"])

  const xmlExtensions =
    settings["html/xml-extensions"] ||
    filterOut(defaultXMLExtensions, settings["html/html-extensions"])

  let reportBadIndent
  switch (settings["html/report-bad-indent"]) {
  case undefined:
  case false:
  case 0:
  case "off":
    reportBadIndent = 0
    break
  case true:
  case 1:
  case "warn":
    reportBadIndent = 1
    break
  case 2:
  case "error":
    reportBadIndent = 2
    break
  default:
    throw new Error(
        oneLine`
        Invalid value for html/report-bad-indent,
        expected one of 0, 1, 2, "off", "warn" or "error"
      `
      )
  }

  const parsedIndent = /^(\+)?(tab|\d+)$/.exec(settings["html/indent"])
  const indent = parsedIndent && {
    relative: parsedIndent[1] === "+",
    spaces: parsedIndent[2] === "tab" ? "\t" : " ".repeat(parsedIndent[2]),
  }

  const javaScriptMIMETypes = settings["html/javascript-mime-types"]
    ? (Array.isArray(settings["html/javascript-mime-types"])
        ? settings["html/javascript-mime-types"]
        : [settings["html/javascript-mime-types"]]).map(
        (s) => (s.startsWith("/") ? compileRegExp(s) : s)
      )
    : [/^(application|text)\/(x-)?(javascript|babel|ecmascript-6)$/i]

  function isJavaScriptMIMEType(type) {
    return javaScriptMIMETypes.some(
      (o) => (typeof o === "string" ? type === o : o.test(type))
    )
  }

  return {
    htmlExtensions,
    xmlExtensions,
    indent,
    reportBadIndent,
    isJavaScriptMIMEType,
  }
}

module.exports = {
  getSettings,
}
