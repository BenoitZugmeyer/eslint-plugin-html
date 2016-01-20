"use strict";

var htmlparser = require("htmlparser2");

function parseIndentDescriptor(indentDescriptor) {
  var match = /^(\+)?(tab|\d+)$/.exec(indentDescriptor);

  if (!match) {
    return { relative: false, spaces: "auto" };
  }

  return {
    relative: match[1] === "+",
    spaces: match[2] === "tab" ? "\t" : Array(Number(match[2]) + 1).join(" "),
  };

}
function extract(code, rawIndentDescriptor) {

  var indentDescriptor = parseIndentDescriptor(rawIndentDescriptor);
  var scriptCode = [];
  var map = [];
  var inScript = false;
  var scriptIndent;
  var index = 0;
  var lineNumber = 1;
  var badIndentationLines = [];
  var currentIndent;

  var parser = new htmlparser.Parser({

    onopentag: function (name, attrs) {
      // Test if current tag is a valid <script> tag.
      if (name !== "script") {
        return;
      }

      if (attrs.type && !/text\/(javascript|babel)/i.test(attrs.type)) {
        return;
      }

      // Mark that we're inside a <script> a tag and push all new lines
      // in between the last </script> tag and this <script> tag to preserve
      // location information.
      inScript = true;
      var previousCode = code.slice(index, parser.endIndex + 1);
      var newLines = previousCode.match(/\n\r|\n|\r/g);
      if (newLines) {
        scriptCode.push.apply(scriptCode, newLines.map(function (newLine) {
          return "//eslint-disable-line spaced-comment" + newLine
        }));
        lineNumber += newLines.length;
        map[lineNumber] = previousCode.match(/[^\n\r]*$/)[0].length;
      }

      scriptIndent = previousCode.match(/([^\n\r]*)<[^<]*$/)[1];
    },

    onclosetag: function (name) {
      if (name !== "script" || !inScript) {
        return;
      }

      if (scriptCode.length) {
        scriptCode[scriptCode.length - 1] = scriptCode[scriptCode.length - 1].replace(/[ \t]*$/, "");
      }
      inScript = false;
      index = parser.startIndex;
      currentIndent = undefined;
    },

    ontext: function (data) {
      if (!inScript) {
        return;
      }

      var isFirstScriptText = currentIndent === undefined;
      if (isFirstScriptText) {
        if (indentDescriptor.spaces === "auto") {
          currentIndent = /^[\n\r]*([ \t]*)/.exec(data)[1];
        }
        else {
          currentIndent = indentDescriptor.spaces;
          if (indentDescriptor.relative) {
            currentIndent = scriptIndent + currentIndent;
          }
        }
      }

      // dedent code
      data = data.replace(/([\n\r])(.*)/g, function (_, newLineChar, line) {
        lineNumber += 1;

        if (line.indexOf(currentIndent) === 0) {
          line = line.slice(currentIndent.length);
          map[lineNumber] = currentIndent.length;
        }
        else {
          // Don't report line if the line is empty
          if (/\S/.test(line)) {
            badIndentationLines.push(lineNumber);
          }
          map[lineNumber] = 0;
        }

        return newLineChar + line;
      });

      scriptCode.push(data); // Collect JavaScript code.
    },

  });

  parser.parseComplete(code);

  return {
    map: map,
    code: scriptCode.join(""),
    badIndentationLines: badIndentationLines,
  };
}

module.exports = extract;
