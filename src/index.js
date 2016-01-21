"use strict";

var eslint = require("eslint");
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

var verify = eslint.linter.verify;

function patch() {
  eslint.linter.verify = function (textOrSourceCode, config, filenameOrOptions, saveState) {
    var indentDescriptor = config.settings && config.settings["html/indent"];
    currentInfos = extract(textOrSourceCode, indentDescriptor);
    return verify.call(this, currentInfos.code, config, filenameOrOptions, saveState);
  };
}

function unpatch() {
  eslint.linter.verify = verify;
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
