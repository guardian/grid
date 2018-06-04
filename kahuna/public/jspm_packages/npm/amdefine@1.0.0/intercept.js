/* */ 
var inserted,
    Module = require('module'),
    fs = require('fs'),
    existingExtFn = Module._extensions['.js'],
    amdefineRegExp = /amdefine\.js/;
inserted = "if (typeof define !== 'function') {var define = require('amdefine')(module)}";
function stripBOM(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
}
function intercept(module, filename) {
  var content = stripBOM(fs.readFileSync(filename, 'utf8'));
  if (!amdefineRegExp.test(module.id)) {
    content = inserted + content;
  }
  module._compile(content, filename);
}
intercept._id = 'amdefine/intercept';
if (!existingExtFn._id || existingExtFn._id !== intercept._id) {
  Module._extensions['.js'] = intercept;
}
