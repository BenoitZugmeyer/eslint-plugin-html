"use strict";

var htmlparser = require("htmlparser2");

function extract(code) {

  var scriptCode = [];
  var map = [];
  var inScript = false;
  var index = 0;
  var lineNumber = 1;
  var indent;

  var parser = new htmlparser.Parser({

    onopentag: function (name, attrs) {
      // Test if current tag is a valid <script> tag.
      if (name !== "script") {
        return;
      }

      if (attrs.type && attrs.type.toLowerCase().indexOf("text/javascript") < 0) {
        return;
      }

      // Mark that we're inside a <script> a tag and push all new lines
      // in between the last </script> tag and this <script> tag to preserve
      // location information.
      inScript = true;
      var newLines = code.slice(index, parser.endIndex).match(/\n\r|\n|\r/g);
      scriptCode.push.apply(scriptCode, newLines);
      lineNumber += newLines.length;
    },

    onclosetag: function (name) {
      if (name !== "script" || !inScript) {
        return;
      }

      inScript = false;
      index = parser.startIndex;
      indent = null;
    },

    ontext: function (data) {
      if (!inScript) {
        return;
      }

      var spaces;
      if (!indent) {
        spaces = /^[\n\r]*(\s*)/.exec(data)[1];
        indent = new RegExp("^(?:" + spaces + ")?(.*)", "gm");
      }

      // dedent code
      data = data.replace(indent, function (_, line) {
        lineNumber += 1;
        return line;
      });

      data = data.replace(/[ \t]*$/, "");

      lineNumber -= 1;

      if (spaces !== undefined) {
        map.push({ line: lineNumber, column: spaces.length });
      }
      else {
        map[map.length - 1].line = lineNumber;
      }
      scriptCode.push(data); // Collect JavaScript code.
    }

  });

  parser.parseComplete(code);

  return { map: map, code: scriptCode.join("") };
}


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
