"use strict";

var extract = require("./extract");

var currentInfos;
var allowedExtensions = ["htm", "html", "xhtml", "vue", "hbs", "mustache"];

var htmlProcessor = {

  preprocess: function (content) {
    currentInfos = extract(content);
    return [currentInfos.code];
  },

  postprocess: function (messages) {
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
