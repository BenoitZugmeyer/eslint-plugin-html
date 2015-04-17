"use strict";

var extract = require("./extract");

var currentInfos;

var htmlProcessor = {
  preprocess: function (content) {
    currentInfos = extract(content);
    return [currentInfos.code];
  },
  postprocess: function (messages) {
    var map = currentInfos.map;
    var blockIndex = 0;
    messages[0].forEach(function (message) {
      while (blockIndex < map.length - 1 && map[blockIndex].line < message.line) {
        blockIndex += 1;
      }
      if (blockIndex < map.length) {
        message.column += map[blockIndex].column;
      }
    });
    return messages[0];
  }
};

module.exports = {
  processors: {
    ".html": htmlProcessor,
    ".xhtml": htmlProcessor,
    ".htm": htmlProcessor
  }
};
