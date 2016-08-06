"use strict";

var path = require("path");
var extract = require("./extract");

var htmlExtensions = [
  ".hbs",
  ".handelbars",
  ".htm",
  ".html",
  ".mustache",
  ".php",
  ".tag",
  ".twig",
  ".vue",
  ".erb",
];

var xmlExtensions = [
  ".xhtml",
  ".xml",
];

// Disclaimer:
//
// This is not a long term viable solution. ESLint needs to improve its processor API to
// provide access to the configuration before actually preprocess files, but it's not
// planed yet. This solution is quite ugly but shouldn't alter eslint process.
//
// Related github issues:
// https://github.com/eslint/eslint/issues/3422
// https://github.com/eslint/eslint/issues/4153

var needle = path.join("lib", "eslint.js");
var eslint;
for (var key in require.cache) {
  if (key.indexOf(needle, key.length - needle.length) >= 0) {
    eslint = require(key);
    if (typeof eslint.verify === "function") {
      break;
    }
  }
}

if (!eslint) {
  throw new Error("eslint-plugin-html error: It seems that eslint is not loaded. " +
                  "If you think it is a bug, please file a report at " +
                  "https://github.com/BenoitZugmeyer/eslint-plugin-html/issues");
}

function createProcessor(defaultXMLMode) {
  var verify = eslint.verify;
  var reportBadIndent;

  var currentInfos;

  function patch() {
    eslint.verify = function (textOrSourceCode, config, filenameOrOptions, saveState) {
      var indentDescriptor = config.settings && config.settings["html/indent"];
      var xmlMode = config.settings && config.settings["html/xml-mode"];
      reportBadIndent = config.settings && config.settings["html/report-bad-indent"];

      if (typeof xmlMode !== "boolean") {
        xmlMode = defaultXMLMode;
      }

      currentInfos = extract(textOrSourceCode, {
        indent: indentDescriptor,
        reportBadIndent: Boolean(reportBadIndent),
        xmlMode: xmlMode,
      });
      return verify.call(this, currentInfos.code, config, filenameOrOptions, saveState);
    };
  }

  function unpatch() {
    eslint.verify = verify;
  }
  return {

    preprocess: function (content) {
      patch();
      return [content];
    },

    postprocess: function (messages) {
      unpatch();

      messages[0].forEach(function (message) {
        message.column += currentInfos.map[message.line] || 0;
      });

      currentInfos.badIndentationLines.forEach(function (line) {
        messages[0].push({
          message: "Bad line indentation.",
          line: line,
          column: 1,
          ruleId: "(html plugin)",
          severity: reportBadIndent === true ? 2 : reportBadIndent,
        });
      });

      messages[0].sort(function (ma, mb) {
        return ma.line - mb.line || ma.column - mb.column;
      });

      return messages[0];
    },

  };

}

var htmlProcessor = createProcessor(false);
var xmlProcessor = createProcessor(true);

var processors = {};

htmlExtensions.forEach(function(ext) {
  processors[ext] = htmlProcessor;
});

xmlExtensions.forEach(function(ext) {
  processors[ext] = xmlProcessor;
});

exports.processors = processors;
