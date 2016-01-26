"use strict";

var path = require("path");
var extract = require("./extract");

// Disclaimer:
//
// This is not a long term viable solution. ESLint needs to improve its processor API to
// provide access to the configuration before actually preprocess files, but it's not
// planed yet. This solution is quite ugly but shouldn't alter eslint process.
//
// Related github issues:
// https://github.com/eslint/eslint/issues/3422
// https://github.com/eslint/eslint/issues/4153

var needle = path.join("eslint", "lib", "eslint.js");
var eslint;
for (var key in require.cache) {
  if (key.indexOf(needle, key.length - needle.length) >= 0) {
    eslint = require(key);
    break;
  }
}

if (!eslint) {
  throw new Error("eslint-plugin-html error: It seems that eslint is not loaded. " +
                  "If you think it is a bug, please file a report at " +
                  "https://github.com/BenoitZugmeyer/eslint-plugin-html/issues");
}

var verify = eslint.verify;
var reportBadIndent;

function patch() {
  eslint.verify = function (textOrSourceCode, config, filenameOrOptions, saveState) {
    var indentDescriptor = config.settings && config.settings["html/indent"];
    reportBadIndent = config.settings && config.settings["html/report-bad-indent"];
    currentInfos = extract(textOrSourceCode, indentDescriptor, Boolean(reportBadIndent));
    return verify.call(this, currentInfos.code, config, filenameOrOptions, saveState);
  };
}

function unpatch() {
  eslint.verify = verify;
}

var currentInfos;
var allowedExtensions = ["htm", "html", "xhtml", "vue", "hbs", "mustache"];

var htmlProcessor = {

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

var getProcessors = function() {
  var processors = {};

  allowedExtensions.forEach(function(ext) {
    processors["." + ext] = htmlProcessor;
  });

  return processors;
};

module.exports = {
  processors: getProcessors(),
};
