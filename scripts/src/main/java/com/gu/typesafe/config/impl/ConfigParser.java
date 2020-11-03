/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.ListIterator;
import java.util.Map;

import com.gu.typesafe.config.ConfigException;

final class ConfigParser {
    static com.gu.typesafe.config.impl.AbstractConfigValue parse(com.gu.typesafe.config.impl.ConfigNodeRoot document,
                                                                 com.gu.typesafe.config.ConfigOrigin origin, com.gu.typesafe.config.ConfigParseOptions options,
                                                                 com.gu.typesafe.config.ConfigIncludeContext includeContext) {
        ParseContext context = new ParseContext(options.getSyntax(), origin, document,
                com.gu.typesafe.config.impl.SimpleIncluder.makeFull(options.getIncluder()), includeContext);
        return context.parse();
    }

    static private final class ParseContext {
        private int lineNumber;
        final private com.gu.typesafe.config.impl.ConfigNodeRoot document;
        final private com.gu.typesafe.config.impl.FullIncluder includer;
        final private com.gu.typesafe.config.ConfigIncludeContext includeContext;
        final private com.gu.typesafe.config.ConfigSyntax flavor;
        final private com.gu.typesafe.config.ConfigOrigin baseOrigin;
        final private LinkedList<Path> pathStack;

        // the number of lists we are inside; this is used to detect the "cannot
        // generate a reference to a list element" problem, and once we fix that
        // problem we should be able to get rid of this variable.
        int arrayCount;

        ParseContext(com.gu.typesafe.config.ConfigSyntax flavor, com.gu.typesafe.config.ConfigOrigin origin, com.gu.typesafe.config.impl.ConfigNodeRoot document,
                     com.gu.typesafe.config.impl.FullIncluder includer, com.gu.typesafe.config.ConfigIncludeContext includeContext) {
            lineNumber = 1;
            this.document = document;
            this.flavor = flavor;
            this.baseOrigin = origin;
            this.includer = includer;
            this.includeContext = includeContext;
            this.pathStack = new LinkedList<Path>();
            this.arrayCount = 0;
        }

        // merge a bunch of adjacent values into one
        // value; change unquoted text into a string
        // value.
        private com.gu.typesafe.config.impl.AbstractConfigValue parseConcatenation(com.gu.typesafe.config.impl.ConfigNodeConcatenation n) {
            // this trick is not done in JSON
            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON)
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Found a concatenation node in JSON");

            List<com.gu.typesafe.config.impl.AbstractConfigValue> values = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>(n.children().size());

            for (com.gu.typesafe.config.impl.AbstractConfigNode node : n.children()) {
                com.gu.typesafe.config.impl.AbstractConfigValue v = null;
                if (node instanceof com.gu.typesafe.config.impl.AbstractConfigNodeValue) {
                    v = parseValue((com.gu.typesafe.config.impl.AbstractConfigNodeValue)node, null);
                    values.add(v);
                }
            }

            return com.gu.typesafe.config.impl.ConfigConcatenation.concatenate(values);
        }

        private com.gu.typesafe.config.impl.SimpleConfigOrigin lineOrigin() {
            return ((com.gu.typesafe.config.impl.SimpleConfigOrigin) baseOrigin).withLineNumber(lineNumber);
        }

        private com.gu.typesafe.config.ConfigException parseError(String message) {
            return parseError(message, null);
        }

        private com.gu.typesafe.config.ConfigException parseError(String message, Throwable cause) {
            return new com.gu.typesafe.config.ConfigException.Parse(lineOrigin(), message, cause);
        }

        private Path fullCurrentPath() {
            // pathStack has top of stack at front
            if (pathStack.isEmpty())
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Bug in parser; tried to get current path when at root");
            else
                return new Path(pathStack.descendingIterator());
        }

        private com.gu.typesafe.config.impl.AbstractConfigValue parseValue(com.gu.typesafe.config.impl.AbstractConfigNodeValue n, List<String> comments) {
            com.gu.typesafe.config.impl.AbstractConfigValue v;

            int startingArrayCount = arrayCount;

            if (n instanceof com.gu.typesafe.config.impl.ConfigNodeSimpleValue) {
                v = ((com.gu.typesafe.config.impl.ConfigNodeSimpleValue) n).value();
            } else if (n instanceof com.gu.typesafe.config.impl.ConfigNodeObject) {
                v = parseObject((com.gu.typesafe.config.impl.ConfigNodeObject)n);
            } else if (n instanceof com.gu.typesafe.config.impl.ConfigNodeArray) {
                v = parseArray((com.gu.typesafe.config.impl.ConfigNodeArray)n);
            } else if (n instanceof com.gu.typesafe.config.impl.ConfigNodeConcatenation) {
                v = parseConcatenation((com.gu.typesafe.config.impl.ConfigNodeConcatenation)n);
            } else {
                throw parseError("Expecting a value but got wrong node type: " + n.getClass());
            }

            if (comments != null && !comments.isEmpty()) {
                v = v.withOrigin(v.origin().prependComments(new ArrayList<String>(comments)));
                comments.clear();
            }

            if (arrayCount != startingArrayCount)
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Bug in config parser: unbalanced array count");

            return v;
        }

        private static com.gu.typesafe.config.impl.AbstractConfigObject createValueUnderPath(Path path,
                                                                                             com.gu.typesafe.config.impl.AbstractConfigValue value) {
            // for path foo.bar, we are creating
            // { "foo" : { "bar" : value } }
            List<String> keys = new ArrayList<String>();

            String key = path.first();
            Path remaining = path.remainder();
            while (key != null) {
                keys.add(key);
                if (remaining == null) {
                    break;
                } else {
                    key = remaining.first();
                    remaining = remaining.remainder();
                }
            }

            // the withComments(null) is to ensure comments are only
            // on the exact leaf node they apply to.
            // a comment before "foo.bar" applies to the full setting
            // "foo.bar" not also to "foo"
            ListIterator<String> i = keys.listIterator(keys.size());
            String deepest = i.previous();
            com.gu.typesafe.config.impl.AbstractConfigObject o = new com.gu.typesafe.config.impl.SimpleConfigObject(value.origin().withComments(null),
                    Collections.<String, com.gu.typesafe.config.impl.AbstractConfigValue> singletonMap(
                            deepest, value));
            while (i.hasPrevious()) {
                Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> m = Collections.<String, com.gu.typesafe.config.impl.AbstractConfigValue> singletonMap(
                        i.previous(), o);
                o = new com.gu.typesafe.config.impl.SimpleConfigObject(value.origin().withComments(null), m);
            }

            return o;
        }

        private void parseInclude(Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> values, com.gu.typesafe.config.impl.ConfigNodeInclude n) {
            boolean isRequired = n.isRequired();
            com.gu.typesafe.config.ConfigIncludeContext cic = includeContext.setParseOptions(includeContext.parseOptions().setAllowMissing(!isRequired));

            com.gu.typesafe.config.impl.AbstractConfigObject obj;
            switch (n.kind()) {
                case URL:
                    URL url;
                    try {
                        url = new URL(n.name());
                    } catch (MalformedURLException e) {
                        throw parseError("include url() specifies an invalid URL: " + n.name(), e);
                    }
                    obj = (com.gu.typesafe.config.impl.AbstractConfigObject) includer.includeURL(cic, url);
                    break;

                case FILE:
                    obj = (com.gu.typesafe.config.impl.AbstractConfigObject) includer.includeFile(cic,
                            new File(n.name()));
                    break;

                case CLASSPATH:
                    obj = (com.gu.typesafe.config.impl.AbstractConfigObject) includer.includeResources(cic, n.name());
                    break;

                case HEURISTIC:
                    obj = (com.gu.typesafe.config.impl.AbstractConfigObject) includer
                            .include(cic, n.name());
                    break;

                default:
                    throw new com.gu.typesafe.config.ConfigException.BugOrBroken("should not be reached");
            }

            // we really should make this work, but for now throwing an
            // exception is better than producing an incorrect result.
            // See https://github.com/lightbend/config/issues/160
            if (arrayCount > 0 && obj.resolveStatus() != ResolveStatus.RESOLVED)
                throw parseError("Due to current limitations of the config parser, when an include statement is nested inside a list value, "
                        + "${} substitutions inside the included file cannot be resolved correctly. Either move the include outside of the list value or "
                        + "remove the ${} statements from the included file.");

            if (!pathStack.isEmpty()) {
                Path prefix = fullCurrentPath();
                obj = obj.relativized(prefix);
            }

            for (String key : obj.keySet()) {
                com.gu.typesafe.config.impl.AbstractConfigValue v = obj.get(key);
                com.gu.typesafe.config.impl.AbstractConfigValue existing = values.get(key);
                if (existing != null) {
                    values.put(key, v.withFallback(existing));
                } else {
                    values.put(key, v);
                }
            }
        }

        private com.gu.typesafe.config.impl.AbstractConfigObject parseObject(com.gu.typesafe.config.impl.ConfigNodeObject n) {
            Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> values = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>();
            com.gu.typesafe.config.impl.SimpleConfigOrigin objectOrigin = lineOrigin();
            boolean lastWasNewline = false;

            ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> nodes = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>(n.children());
            List<String> comments = new ArrayList<String>();
            for (int i = 0; i < nodes.size(); i++) {
                com.gu.typesafe.config.impl.AbstractConfigNode node = nodes.get(i);
                if (node instanceof com.gu.typesafe.config.impl.ConfigNodeComment) {
                    lastWasNewline = false;
                    comments.add(((com.gu.typesafe.config.impl.ConfigNodeComment) node).commentText());
                } else if (node instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken && com.gu.typesafe.config.impl.Tokens.isNewline(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) node).token())) {
                    lineNumber++;
                    if (lastWasNewline) {
                        // Drop all comments if there was a blank line and start a new comment block
                        comments.clear();
                    }
                    lastWasNewline = true;
                } else if (flavor != com.gu.typesafe.config.ConfigSyntax.JSON && node instanceof com.gu.typesafe.config.impl.ConfigNodeInclude) {
                    parseInclude(values, (com.gu.typesafe.config.impl.ConfigNodeInclude)node);
                    lastWasNewline = false;
                } else if (node instanceof com.gu.typesafe.config.impl.ConfigNodeField) {
                    lastWasNewline = false;
                    Path path = ((com.gu.typesafe.config.impl.ConfigNodeField) node).path().value();
                    comments.addAll(((com.gu.typesafe.config.impl.ConfigNodeField) node).comments());

                    // path must be on-stack while we parse the value
                    pathStack.push(path);
                    if (((com.gu.typesafe.config.impl.ConfigNodeField) node).separator() == com.gu.typesafe.config.impl.Tokens.PLUS_EQUALS) {
                        // we really should make this work, but for now throwing
                        // an exception is better than producing an incorrect
                        // result. See
                        // https://github.com/lightbend/config/issues/160
                        if (arrayCount > 0)
                            throw parseError("Due to current limitations of the config parser, += does not work nested inside a list. "
                                    + "+= expands to a ${} substitution and the path in ${} cannot currently refer to list elements. "
                                    + "You might be able to move the += outside of the list and then refer to it from inside the list with ${}.");

                        // because we will put it in an array after the fact so
                        // we want this to be incremented during the parseValue
                        // below in order to throw the above exception.
                        arrayCount += 1;
                    }

                    com.gu.typesafe.config.impl.AbstractConfigNodeValue valueNode;
                    com.gu.typesafe.config.impl.AbstractConfigValue newValue;

                    valueNode = ((com.gu.typesafe.config.impl.ConfigNodeField) node).value();

                    // comments from the key token go to the value token
                    newValue = parseValue(valueNode, comments);

                    if (((com.gu.typesafe.config.impl.ConfigNodeField) node).separator() == com.gu.typesafe.config.impl.Tokens.PLUS_EQUALS) {
                        arrayCount -= 1;

                        List<com.gu.typesafe.config.impl.AbstractConfigValue> concat = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>(2);
                        com.gu.typesafe.config.impl.AbstractConfigValue previousRef = new com.gu.typesafe.config.impl.ConfigReference(newValue.origin(),
                                new com.gu.typesafe.config.impl.SubstitutionExpression(fullCurrentPath(), true /* optional */));
                        com.gu.typesafe.config.impl.AbstractConfigValue list = new com.gu.typesafe.config.impl.SimpleConfigList(newValue.origin(),
                                Collections.singletonList(newValue));
                        concat.add(previousRef);
                        concat.add(list);
                        newValue = com.gu.typesafe.config.impl.ConfigConcatenation.concatenate(concat);
                    }

                    // Grab any trailing comments on the same line
                    if (i < nodes.size() - 1) {
                        i++;
                        while (i < nodes.size()) {
                            if (nodes.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodeComment) {
                                com.gu.typesafe.config.impl.ConfigNodeComment comment = (com.gu.typesafe.config.impl.ConfigNodeComment) nodes.get(i);
                                newValue = newValue.withOrigin(newValue.origin().appendComments(
                                            Collections.singletonList(comment.commentText())));
                                break;
                            } else if (nodes.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken) {
                                com.gu.typesafe.config.impl.ConfigNodeSingleToken curr = (com.gu.typesafe.config.impl.ConfigNodeSingleToken) nodes.get(i);
                                if (curr.token() == com.gu.typesafe.config.impl.Tokens.COMMA || com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(curr.token())) {
                                    // keep searching, as there could still be a comment
                                } else {
                                    i--;
                                    break;
                                }
                            } else {
                                i--;
                                break;
                            }
                            i++;
                        }
                    }

                    pathStack.pop();

                    String key = path.first();
                    Path remaining = path.remainder();

                    if (remaining == null) {
                        com.gu.typesafe.config.impl.AbstractConfigValue existing = values.get(key);
                        if (existing != null) {
                            // In strict JSON, dups should be an error; while in
                            // our custom config language, they should be merged
                            // if the value is an object (or substitution that
                            // could become an object).

                            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                                throw parseError("JSON does not allow duplicate fields: '"
                                    + key
                                    + "' was already seen at "
                                    + existing.origin().description());
                            } else {
                                newValue = newValue.withFallback(existing);
                            }
                        }
                        values.put(key, newValue);
                    } else {
                        if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                            throw new ConfigException.BugOrBroken(
                                    "somehow got multi-element path in JSON mode");
                        }

                        com.gu.typesafe.config.impl.AbstractConfigObject obj = createValueUnderPath(
                                remaining, newValue);
                        com.gu.typesafe.config.impl.AbstractConfigValue existing = values.get(key);
                        if (existing != null) {
                            obj = obj.withFallback(existing);
                        }
                        values.put(key, obj);
                    }
                }
            }

            return new com.gu.typesafe.config.impl.SimpleConfigObject(objectOrigin, values);
        }

        private com.gu.typesafe.config.impl.SimpleConfigList parseArray(com.gu.typesafe.config.impl.ConfigNodeArray n) {
            arrayCount += 1;

            com.gu.typesafe.config.impl.SimpleConfigOrigin arrayOrigin = lineOrigin();
            List<com.gu.typesafe.config.impl.AbstractConfigValue> values = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>();

            boolean lastWasNewLine = false;
            List<String> comments = new ArrayList<String>();

            com.gu.typesafe.config.impl.AbstractConfigValue v = null;

            for (com.gu.typesafe.config.impl.AbstractConfigNode node : n.children()) {
                if (node instanceof com.gu.typesafe.config.impl.ConfigNodeComment) {
                    comments.add(((com.gu.typesafe.config.impl.ConfigNodeComment) node).commentText());
                    lastWasNewLine = false;
                } else if (node instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken && com.gu.typesafe.config.impl.Tokens.isNewline(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) node).token())) {
                    lineNumber++;
                    if (lastWasNewLine && v == null) {
                        comments.clear();
                    } else if (v != null) {
                        values.add(v.withOrigin(v.origin().appendComments(new ArrayList<String>(comments))));
                        comments.clear();
                        v = null;
                    }
                    lastWasNewLine = true;
                } else if (node instanceof com.gu.typesafe.config.impl.AbstractConfigNodeValue) {
                    lastWasNewLine = false;
                    if (v != null) {
                        values.add(v.withOrigin(v.origin().appendComments(new ArrayList<String>(comments))));
                        comments.clear();
                    }
                    v = parseValue((com.gu.typesafe.config.impl.AbstractConfigNodeValue)node, comments);
                }
            }
            // There shouldn't be any comments at this point, but add them just in case
            if (v != null) {
                values.add(v.withOrigin(v.origin().appendComments(new ArrayList<String>(comments))));
            }
            arrayCount -= 1;
            return new com.gu.typesafe.config.impl.SimpleConfigList(arrayOrigin, values);
        }

        com.gu.typesafe.config.impl.AbstractConfigValue parse() {
            com.gu.typesafe.config.impl.AbstractConfigValue result = null;
            ArrayList<String> comments = new ArrayList<String>();
            boolean lastWasNewLine = false;
            for (com.gu.typesafe.config.impl.AbstractConfigNode node : document.children()) {
                if (node instanceof com.gu.typesafe.config.impl.ConfigNodeComment) {
                    comments.add(((com.gu.typesafe.config.impl.ConfigNodeComment) node).commentText());
                    lastWasNewLine = false;
                } else if (node instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken) {
                    com.gu.typesafe.config.impl.Token t = ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) node).token();
                    if (com.gu.typesafe.config.impl.Tokens.isNewline(t)) {
                        lineNumber++;
                        if (lastWasNewLine && result == null) {
                            comments.clear();
                        } else if (result != null) {
                            result = result.withOrigin(result.origin().appendComments(new ArrayList<String>(comments)));
                            comments.clear();
                            break;
                        }
                        lastWasNewLine = true;
                    }
                } else if (node instanceof com.gu.typesafe.config.impl.ConfigNodeComplexValue) {
                    result = parseValue((com.gu.typesafe.config.impl.ConfigNodeComplexValue)node, comments);
                    lastWasNewLine = false;
                }
            }
            return result;
        }
    }
}
