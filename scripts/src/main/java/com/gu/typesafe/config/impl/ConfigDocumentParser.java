/**
 *   Copyright (C) 2015 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.util.*;

import com.gu.typesafe.config.ConfigSyntax;

final class ConfigDocumentParser {
    static com.gu.typesafe.config.impl.ConfigNodeRoot parse(Iterator<com.gu.typesafe.config.impl.Token> tokens, com.gu.typesafe.config.ConfigOrigin origin, com.gu.typesafe.config.ConfigParseOptions options) {
        com.gu.typesafe.config.ConfigSyntax syntax = options.getSyntax() == null ? com.gu.typesafe.config.ConfigSyntax.CONF : options.getSyntax();
        ParseContext context = new ParseContext(syntax, origin, tokens);
        return context.parse();
    }

    static com.gu.typesafe.config.impl.AbstractConfigNodeValue parseValue(Iterator<com.gu.typesafe.config.impl.Token> tokens, com.gu.typesafe.config.ConfigOrigin origin, com.gu.typesafe.config.ConfigParseOptions options) {
        com.gu.typesafe.config.ConfigSyntax syntax = options.getSyntax() == null ? com.gu.typesafe.config.ConfigSyntax.CONF : options.getSyntax();
        ParseContext context = new ParseContext(syntax, origin, tokens);
        return context.parseSingleValue();
    }

    static private final class ParseContext {
        private int lineNumber;
        final private Stack<com.gu.typesafe.config.impl.Token> buffer;
        final private Iterator<com.gu.typesafe.config.impl.Token> tokens;
        final private com.gu.typesafe.config.ConfigSyntax flavor;
        final private com.gu.typesafe.config.ConfigOrigin baseOrigin;
        // this is the number of "equals" we are inside,
        // used to modify the error message to reflect that
        // someone may think this is .properties format.
        int equalsCount;

        ParseContext(com.gu.typesafe.config.ConfigSyntax flavor, com.gu.typesafe.config.ConfigOrigin origin, Iterator<com.gu.typesafe.config.impl.Token> tokens) {
            lineNumber = 1;
            buffer = new Stack<com.gu.typesafe.config.impl.Token>();
            this.tokens = tokens;
            this.flavor = flavor;
            this.equalsCount = 0;
            this.baseOrigin = origin;
        }

        private com.gu.typesafe.config.impl.Token popToken() {
            if (buffer.isEmpty()) {
                return tokens.next();
            }
            return buffer.pop();
        }

        private com.gu.typesafe.config.impl.Token nextToken() {
            com.gu.typesafe.config.impl.Token t = popToken();
            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                if (com.gu.typesafe.config.impl.Tokens.isUnquotedText(t) && !isUnquotedWhitespace(t)) {
                    throw parseError("Token not allowed in valid JSON: '"
                            + com.gu.typesafe.config.impl.Tokens.getUnquotedText(t) + "'");
                } else if (com.gu.typesafe.config.impl.Tokens.isSubstitution(t)) {
                    throw parseError("Substitutions (${} syntax) not allowed in JSON");
                }
            }
            return t;
        }

        private com.gu.typesafe.config.impl.Token nextTokenCollectingWhitespace(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> nodes) {
            while (true) {
                com.gu.typesafe.config.impl.Token t = nextToken();
                if (com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(t) || com.gu.typesafe.config.impl.Tokens.isNewline(t) || isUnquotedWhitespace(t)) {
                    nodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                    if (com.gu.typesafe.config.impl.Tokens.isNewline(t)) {
                        lineNumber = t.lineNumber() + 1;
                    }
                } else if (com.gu.typesafe.config.impl.Tokens.isComment(t)) {
                    nodes.add(new com.gu.typesafe.config.impl.ConfigNodeComment(t));
                } else {
                    int newNumber = t.lineNumber();
                    if (newNumber >= 0)
                        lineNumber = newNumber;
                    return t;
                }
            }
        }

        private void putBack(com.gu.typesafe.config.impl.Token token) {
            buffer.push(token);
        }

        // In arrays and objects, comma can be omitted
        // as long as there's at least one newline instead.
        // this skips any newlines in front of a comma,
        // skips the comma, and returns true if it found
        // either a newline or a comma. The iterator
        // is left just after the comma or the newline.
        private boolean checkElementSeparator(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> nodes) {
            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                com.gu.typesafe.config.impl.Token t = nextTokenCollectingWhitespace(nodes);
                if (t == com.gu.typesafe.config.impl.Tokens.COMMA) {
                    nodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                    return true;
                } else {
                    putBack(t);
                    return false;
                }
            } else {
                boolean sawSeparatorOrNewline = false;
                com.gu.typesafe.config.impl.Token t = nextToken();
                while (true) {
                    if (com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(t) || isUnquotedWhitespace(t)) {
                        nodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                    } else if (com.gu.typesafe.config.impl.Tokens.isComment(t)) {
                        nodes.add(new com.gu.typesafe.config.impl.ConfigNodeComment(t));
                    } else if (com.gu.typesafe.config.impl.Tokens.isNewline(t)) {
                        sawSeparatorOrNewline = true;
                        lineNumber++;
                        nodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                        // we want to continue to also eat
                        // a comma if there is one.
                    } else if (t == com.gu.typesafe.config.impl.Tokens.COMMA) {
                        nodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                        return true;
                    } else {
                        // non-newline-or-comma
                        putBack(t);
                        return sawSeparatorOrNewline;
                    }
                    t = nextToken();
                }
            }
        }

        // parse a concatenation. If there is no concatenation, return the next value
        private com.gu.typesafe.config.impl.AbstractConfigNodeValue consolidateValues(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> nodes) {
            // this trick is not done in JSON
            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON)
                return null;

            // create only if we have value tokens
            ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> values = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>();
            int valueCount = 0;

            // ignore a newline up front
            com.gu.typesafe.config.impl.Token t = nextTokenCollectingWhitespace(nodes);
            while (true) {
                com.gu.typesafe.config.impl.AbstractConfigNodeValue v = null;
                if (com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(t)) {
                    values.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                    t = nextToken();
                    continue;
                }
                else if (com.gu.typesafe.config.impl.Tokens.isValue(t) || com.gu.typesafe.config.impl.Tokens.isUnquotedText(t)
                        || com.gu.typesafe.config.impl.Tokens.isSubstitution(t) || t == com.gu.typesafe.config.impl.Tokens.OPEN_CURLY
                        || t == com.gu.typesafe.config.impl.Tokens.OPEN_SQUARE) {
                    // there may be newlines _within_ the objects and arrays
                    v = parseValue(t);
                    valueCount++;
                } else {
                    break;
                }

                if (v == null)
                    throw new com.gu.typesafe.config.ConfigException.BugOrBroken("no value");

                values.add(v);

                t = nextToken(); // but don't consolidate across a newline
            }

            putBack(t);

            // No concatenation was seen, but a single value may have been parsed, so return it, and put back
            // all succeeding tokens
            if (valueCount < 2) {
                com.gu.typesafe.config.impl.AbstractConfigNodeValue value = null;
                for (com.gu.typesafe.config.impl.AbstractConfigNode node : values) {
                    if (node instanceof com.gu.typesafe.config.impl.AbstractConfigNodeValue)
                        value = (com.gu.typesafe.config.impl.AbstractConfigNodeValue)node;
                    else if (value == null)
                        nodes.add(node);
                    else
                        putBack((new ArrayList<com.gu.typesafe.config.impl.Token>(node.tokens())).get(0));
                }
                return value;
            }

            // Put back any trailing whitespace, as the parent object is responsible for tracking
            // any leading/trailing whitespace
            for (int i = values.size() - 1; i >= 0; i--) {
                if (values.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken) {
                    putBack(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) values.get(i)).token());
                    values.remove(i);
                } else {
                    break;
                }
            }
            return new com.gu.typesafe.config.impl.ConfigNodeConcatenation(values);
        }

        private com.gu.typesafe.config.ConfigException parseError(String message) {
            return parseError(message, null);
        }

        private com.gu.typesafe.config.ConfigException parseError(String message, Throwable cause) {
            return new com.gu.typesafe.config.ConfigException.Parse(baseOrigin.withLineNumber(lineNumber), message, cause);
        }

        private String addQuoteSuggestion(String badToken, String message) {
            return addQuoteSuggestion(null, equalsCount > 0, badToken, message);
        }

        private String addQuoteSuggestion(Path lastPath, boolean insideEquals, String badToken,
                                          String message) {
            String previousFieldName = lastPath != null ? lastPath.render() : null;

            String part;
            if (badToken.equals(com.gu.typesafe.config.impl.Tokens.END.toString())) {
                // EOF requires special handling for the error to make sense.
                if (previousFieldName != null)
                    part = message + " (if you intended '" + previousFieldName
                            + "' to be part of a value, instead of a key, "
                            + "try adding double quotes around the whole value";
                else
                    return message;
            } else {
                if (previousFieldName != null) {
                    part = message + " (if you intended " + badToken
                            + " to be part of the value for '" + previousFieldName + "', "
                            + "try enclosing the value in double quotes";
                } else {
                    part = message + " (if you intended " + badToken
                            + " to be part of a key or string value, "
                            + "try enclosing the key or value in double quotes";
                }
            }

            if (insideEquals)
                return part
                        + ", or you may be able to rename the file .properties rather than .conf)";
            else
                return part + ")";
        }

        private com.gu.typesafe.config.impl.AbstractConfigNodeValue parseValue(com.gu.typesafe.config.impl.Token t) {
            com.gu.typesafe.config.impl.AbstractConfigNodeValue v = null;
            int startingEqualsCount = equalsCount;

            if (com.gu.typesafe.config.impl.Tokens.isValue(t) || com.gu.typesafe.config.impl.Tokens.isUnquotedText(t) || com.gu.typesafe.config.impl.Tokens.isSubstitution(t)) {
                v = new com.gu.typesafe.config.impl.ConfigNodeSimpleValue(t);
            } else if (t == com.gu.typesafe.config.impl.Tokens.OPEN_CURLY) {
                v = parseObject(true);
            } else if (t== com.gu.typesafe.config.impl.Tokens.OPEN_SQUARE) {
                v = parseArray();
            } else {
                throw parseError(addQuoteSuggestion(t.toString(),
                        "Expecting a value but got wrong token: " + t));
            }

            if (equalsCount != startingEqualsCount)
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Bug in config parser: unbalanced equals count");

            return v;
        }

        private com.gu.typesafe.config.impl.ConfigNodePath parseKey(com.gu.typesafe.config.impl.Token token) {
            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                if (com.gu.typesafe.config.impl.Tokens.isValueWithType(token, com.gu.typesafe.config.ConfigValueType.STRING)) {
                    return com.gu.typesafe.config.impl.PathParser.parsePathNodeExpression(Collections.singletonList(token).iterator(),
                                                              baseOrigin.withLineNumber(lineNumber));
                } else {
                    throw parseError("Expecting close brace } or a field name here, got "
                            + token);
                }
            } else {
                List<com.gu.typesafe.config.impl.Token> expression = new ArrayList<com.gu.typesafe.config.impl.Token>();
                com.gu.typesafe.config.impl.Token t = token;
                while (com.gu.typesafe.config.impl.Tokens.isValue(t) || com.gu.typesafe.config.impl.Tokens.isUnquotedText(t)) {
                    expression.add(t);
                    t = nextToken(); // note: don't cross a newline
                }

                if (expression.isEmpty()) {
                    throw parseError(ExpectingClosingParenthesisError + t);
                }

                putBack(t); // put back the token we ended with
                return com.gu.typesafe.config.impl.PathParser.parsePathNodeExpression(expression.iterator(),
                                                          baseOrigin.withLineNumber(lineNumber));
            }
        }

        private static boolean isIncludeKeyword(com.gu.typesafe.config.impl.Token t) {
            return com.gu.typesafe.config.impl.Tokens.isUnquotedText(t)
                    && com.gu.typesafe.config.impl.Tokens.getUnquotedText(t).equals("include");
        }

        private static boolean isUnquotedWhitespace(com.gu.typesafe.config.impl.Token t) {
            if (!com.gu.typesafe.config.impl.Tokens.isUnquotedText(t))
                return false;

            String s = com.gu.typesafe.config.impl.Tokens.getUnquotedText(t);

            for (int i = 0; i < s.length(); ++i) {
                char c = s.charAt(i);
                if (!ConfigImplUtil.isWhitespace(c))
                    return false;
            }
            return true;
        }

        private boolean isKeyValueSeparatorToken(com.gu.typesafe.config.impl.Token t) {
            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                return t == com.gu.typesafe.config.impl.Tokens.COLON;
            } else {
                return t == com.gu.typesafe.config.impl.Tokens.COLON || t == com.gu.typesafe.config.impl.Tokens.EQUALS || t == com.gu.typesafe.config.impl.Tokens.PLUS_EQUALS;
            }
        }

        private final String ExpectingClosingParenthesisError = "expecting a close parentheses ')' here, not: ";

        private com.gu.typesafe.config.impl.ConfigNodeInclude parseInclude(ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> children) {

            com.gu.typesafe.config.impl.Token t = nextTokenCollectingWhitespace(children);

            // we either have a 'required()' or a quoted string or the "file()" syntax
            if (com.gu.typesafe.config.impl.Tokens.isUnquotedText(t)) {
                String kindText = com.gu.typesafe.config.impl.Tokens.getUnquotedText(t);

                if (kindText.startsWith("required(")) {
                    String r = kindText.replaceFirst("required\\(","");
                    if (r.length()>0) {
                        putBack(com.gu.typesafe.config.impl.Tokens.newUnquotedText(t.origin(),r));
                    }

                    children.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                    //children.add(new ConfigNodeSingleToken(tOpen));

                    com.gu.typesafe.config.impl.ConfigNodeInclude res = parseIncludeResource(children, true);

                    t = nextTokenCollectingWhitespace(children);

                    if (com.gu.typesafe.config.impl.Tokens.isUnquotedText(t) && com.gu.typesafe.config.impl.Tokens.getUnquotedText(t).equals(")")) {
                        // OK, close paren
                    } else {
                        throw parseError(ExpectingClosingParenthesisError + t);
                    }

                    return res;
                } else {
                    putBack(t);
                    return parseIncludeResource(children, false);
                }
            }
            else {
                putBack(t);
                return parseIncludeResource(children, false);
            }
        }

        private com.gu.typesafe.config.impl.ConfigNodeInclude parseIncludeResource(ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> children, boolean isRequired) {
            com.gu.typesafe.config.impl.Token t = nextTokenCollectingWhitespace(children);

            // we either have a quoted string or the "file()" syntax
            if (com.gu.typesafe.config.impl.Tokens.isUnquotedText(t)) {
                // get foo(
                String kindText = com.gu.typesafe.config.impl.Tokens.getUnquotedText(t);
                com.gu.typesafe.config.impl.ConfigIncludeKind kind;
                String prefix;

                if (kindText.startsWith("url(")) {
                    kind = com.gu.typesafe.config.impl.ConfigIncludeKind.URL;
                    prefix = "url(";
                } else if (kindText.startsWith("file(")) {
                    kind = com.gu.typesafe.config.impl.ConfigIncludeKind.FILE;
                    prefix = "file(";
                } else if (kindText.startsWith("classpath(")) {
                    kind = com.gu.typesafe.config.impl.ConfigIncludeKind.CLASSPATH;
                    prefix = "classpath(";
                } else {
                    throw parseError("expecting include parameter to be quoted filename, file(), classpath(), or url(). No spaces are allowed before the open paren. Not expecting: "
                            + t);
                }
                String r = kindText.replaceFirst("[^(]*\\(","");
                if (r.length()>0) {
                    putBack(com.gu.typesafe.config.impl.Tokens.newUnquotedText(t.origin(),r));
                }

                children.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));

                // skip space inside parens
                t = nextTokenCollectingWhitespace(children);

                // quoted string
                if (!com.gu.typesafe.config.impl.Tokens.isValueWithType(t, com.gu.typesafe.config.ConfigValueType.STRING)) {
                    throw parseError("expecting include " + prefix + ") parameter to be a quoted string, rather than: " + t);
                }
                children.add(new com.gu.typesafe.config.impl.ConfigNodeSimpleValue(t));
                // skip space after string, inside parens
                t = nextTokenCollectingWhitespace(children);

                if (com.gu.typesafe.config.impl.Tokens.isUnquotedText(t) && com.gu.typesafe.config.impl.Tokens.getUnquotedText(t).startsWith(")")) {
                    String rest = com.gu.typesafe.config.impl.Tokens.getUnquotedText(t).substring(1);
                    if (rest.length()>0) {
                        putBack(com.gu.typesafe.config.impl.Tokens.newUnquotedText(t.origin(),rest));
                    }
                    // OK, close paren
                } else {
                    throw parseError(ExpectingClosingParenthesisError + t);
                }

                return new com.gu.typesafe.config.impl.ConfigNodeInclude(children, kind, isRequired);
            } else if (com.gu.typesafe.config.impl.Tokens.isValueWithType(t, com.gu.typesafe.config.ConfigValueType.STRING)) {
                children.add(new com.gu.typesafe.config.impl.ConfigNodeSimpleValue(t));
                return new com.gu.typesafe.config.impl.ConfigNodeInclude(children, com.gu.typesafe.config.impl.ConfigIncludeKind.HEURISTIC, isRequired);
            } else {
                throw parseError("include keyword is not followed by a quoted string, but by: " + t);
            }
        }

        private com.gu.typesafe.config.impl.ConfigNodeComplexValue parseObject(boolean hadOpenCurly) {
            // invoked just after the OPEN_CURLY (or START, if !hadOpenCurly)
            boolean afterComma = false;
            Path lastPath = null;
            boolean lastInsideEquals = false;
            ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> objectNodes = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>();
            ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> keyValueNodes;
            HashMap<String, Boolean> keys  = new HashMap<String, Boolean>();
            if (hadOpenCurly)
                objectNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.OPEN_CURLY));

            while (true) {
                com.gu.typesafe.config.impl.Token t = nextTokenCollectingWhitespace(objectNodes);
                if (t == com.gu.typesafe.config.impl.Tokens.CLOSE_CURLY) {
                    if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON && afterComma) {
                        throw parseError(addQuoteSuggestion(t.toString(),
                                "expecting a field name after a comma, got a close brace } instead"));
                    } else if (!hadOpenCurly) {
                        throw parseError(addQuoteSuggestion(t.toString(),
                                "unbalanced close brace '}' with no open brace"));
                    }
                    objectNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.CLOSE_CURLY));
                    break;
                } else if (t == com.gu.typesafe.config.impl.Tokens.END && !hadOpenCurly) {
                    putBack(t);
                    break;
                } else if (flavor != com.gu.typesafe.config.ConfigSyntax.JSON && isIncludeKeyword(t)) {
                    ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> includeNodes = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>();
                    includeNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                    objectNodes.add(parseInclude(includeNodes));
                    afterComma = false;
                } else {
                    keyValueNodes = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>();
                    com.gu.typesafe.config.impl.Token keyToken = t;
                    com.gu.typesafe.config.impl.ConfigNodePath path = parseKey(keyToken);
                    keyValueNodes.add(path);
                    com.gu.typesafe.config.impl.Token afterKey = nextTokenCollectingWhitespace(keyValueNodes);
                    boolean insideEquals = false;

                    com.gu.typesafe.config.impl.AbstractConfigNodeValue nextValue;
                    if (flavor == com.gu.typesafe.config.ConfigSyntax.CONF && afterKey == com.gu.typesafe.config.impl.Tokens.OPEN_CURLY) {
                        // can omit the ':' or '=' before an object value
                        nextValue = parseValue(afterKey);
                    } else {
                        if (!isKeyValueSeparatorToken(afterKey)) {
                            throw parseError(addQuoteSuggestion(afterKey.toString(),
                                    "Key '" + path.render() + "' may not be followed by token: "
                                            + afterKey));
                        }

                        keyValueNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(afterKey));

                        if (afterKey == com.gu.typesafe.config.impl.Tokens.EQUALS) {
                            insideEquals = true;
                            equalsCount += 1;
                        }

                        nextValue = consolidateValues(keyValueNodes);
                        if (nextValue == null) {
                            nextValue = parseValue(nextTokenCollectingWhitespace(keyValueNodes));
                        }
                    }

                    keyValueNodes.add(nextValue);
                    if (insideEquals) {
                        equalsCount -= 1;
                    }
                    lastInsideEquals = insideEquals;

                    String key = path.value().first();
                    Path remaining = path.value().remainder();

                    if (remaining == null) {
                        Boolean existing = keys.get(key);
                        if (existing != null) {
                            // In strict JSON, dups should be an error; while in
                            // our custom config language, they should be merged
                            // if the value is an object (or substitution that
                            // could become an object).

                            if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                                throw parseError("JSON does not allow duplicate fields: '"
                                        + key
                                        + "' was already seen");
                            }
                        }
                        keys.put(key, true);
                    } else {
                        if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                                    "somehow got multi-element path in JSON mode");
                        }
                        keys.put(key, true);
                    }

                    afterComma = false;
                    objectNodes.add(new ConfigNodeField(keyValueNodes));
                }

                if (checkElementSeparator(objectNodes)) {
                    // continue looping
                    afterComma = true;
                } else {
                    t = nextTokenCollectingWhitespace(objectNodes);
                    if (t == com.gu.typesafe.config.impl.Tokens.CLOSE_CURLY) {
                        if (!hadOpenCurly) {
                            throw parseError(addQuoteSuggestion(lastPath, lastInsideEquals,
                                    t.toString(), "unbalanced close brace '}' with no open brace"));
                        }
                        objectNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                        break;
                    } else if (hadOpenCurly) {
                        throw parseError(addQuoteSuggestion(lastPath, lastInsideEquals,
                                t.toString(), "Expecting close brace } or a comma, got " + t));
                    } else {
                        if (t == com.gu.typesafe.config.impl.Tokens.END) {
                            putBack(t);
                            break;
                        } else {
                            throw parseError(addQuoteSuggestion(lastPath, lastInsideEquals,
                                    t.toString(), "Expecting end of input or a comma, got " + t));
                        }
                    }
                }
            }

            return new com.gu.typesafe.config.impl.ConfigNodeObject(objectNodes);
        }

        private com.gu.typesafe.config.impl.ConfigNodeComplexValue parseArray() {
            ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> children = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>();
            children.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.OPEN_SQUARE));
            // invoked just after the OPEN_SQUARE
            com.gu.typesafe.config.impl.Token t;

            com.gu.typesafe.config.impl.AbstractConfigNodeValue nextValue = consolidateValues(children);
            if (nextValue != null) {
                children.add(nextValue);
            } else {
                t = nextTokenCollectingWhitespace(children);

                // special-case the first element
                if (t == com.gu.typesafe.config.impl.Tokens.CLOSE_SQUARE) {
                    children.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                    return new ConfigNodeArray(children);
                } else if (com.gu.typesafe.config.impl.Tokens.isValue(t) || t == com.gu.typesafe.config.impl.Tokens.OPEN_CURLY
                        || t == com.gu.typesafe.config.impl.Tokens.OPEN_SQUARE || com.gu.typesafe.config.impl.Tokens.isUnquotedText(t)
                        || com.gu.typesafe.config.impl.Tokens.isSubstitution(t)) {
                    nextValue = parseValue(t);
                    children.add(nextValue);
                } else {
                    throw parseError("List should have ] or a first element after the open [, instead had token: "
                            + t
                            + " (if you want "
                            + t
                            + " to be part of a string value, then double-quote it)");
                }
            }

            // now remaining elements
            while (true) {
                // just after a value
                if (checkElementSeparator(children)) {
                    // comma (or newline equivalent) consumed
                } else {
                    t = nextTokenCollectingWhitespace(children);
                    if (t == com.gu.typesafe.config.impl.Tokens.CLOSE_SQUARE) {
                        children.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(t));
                        return new ConfigNodeArray(children);
                    } else {
                        throw parseError("List should have ended with ] or had a comma, instead had token: "
                                + t
                                + " (if you want "
                                + t
                                + " to be part of a string value, then double-quote it)");
                    }
                }

                // now just after a comma
                nextValue = consolidateValues(children);
                if (nextValue != null) {
                    children.add(nextValue);
                } else {
                    t = nextTokenCollectingWhitespace(children);
                    if (com.gu.typesafe.config.impl.Tokens.isValue(t) || t == com.gu.typesafe.config.impl.Tokens.OPEN_CURLY
                            || t == com.gu.typesafe.config.impl.Tokens.OPEN_SQUARE || com.gu.typesafe.config.impl.Tokens.isUnquotedText(t)
                            || com.gu.typesafe.config.impl.Tokens.isSubstitution(t)) {
                        nextValue = parseValue(t);
                        children.add(nextValue);
                    } else if (flavor != com.gu.typesafe.config.ConfigSyntax.JSON && t == com.gu.typesafe.config.impl.Tokens.CLOSE_SQUARE) {
                        // we allow one trailing comma
                        putBack(t);
                    } else {
                        throw parseError("List should have had new element after a comma, instead had token: "
                                + t
                                + " (if you want the comma or "
                                + t
                                + " to be part of a string value, then double-quote it)");
                    }
                }
            }
        }

        com.gu.typesafe.config.impl.ConfigNodeRoot parse() {
            ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> children = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>();
            com.gu.typesafe.config.impl.Token t = nextToken();
            if (t == com.gu.typesafe.config.impl.Tokens.START) {
                // OK
            } else {
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                        "token stream did not begin with START, had " + t);
            }

            t = nextTokenCollectingWhitespace(children);
            com.gu.typesafe.config.impl.AbstractConfigNode result = null;
            boolean missingCurly = false;
            if (t == com.gu.typesafe.config.impl.Tokens.OPEN_CURLY || t == com.gu.typesafe.config.impl.Tokens.OPEN_SQUARE) {
                result = parseValue(t);
            } else {
                if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON) {
                    if (t == com.gu.typesafe.config.impl.Tokens.END) {
                        throw parseError("Empty document");
                    } else {
                        throw parseError("Document must have an object or array at root, unexpected token: "
                                + t);
                    }
                } else {
                    // the root object can omit the surrounding braces.
                    // this token should be the first field's key, or part
                    // of it, so put it back.
                    putBack(t);
                    missingCurly = true;
                    result = parseObject(false);
                }
            }
            // Need to pull the children out of the resulting node so we can keep leading
            // and trailing whitespace if this was a no-brace object. Otherwise, we need to add
            // the result into the list of children.
            if (result instanceof com.gu.typesafe.config.impl.ConfigNodeObject && missingCurly) {
                children.addAll(((com.gu.typesafe.config.impl.ConfigNodeComplexValue) result).children());
            } else {
                children.add(result);
            }
            t = nextTokenCollectingWhitespace(children);
            if (t == com.gu.typesafe.config.impl.Tokens.END) {
                if (missingCurly) {
                    // If there were no braces, the entire document should be treated as a single object
                    return new com.gu.typesafe.config.impl.ConfigNodeRoot(Collections.singletonList((com.gu.typesafe.config.impl.AbstractConfigNode)new com.gu.typesafe.config.impl.ConfigNodeObject(children)), baseOrigin);
                } else {
                    return new com.gu.typesafe.config.impl.ConfigNodeRoot(children, baseOrigin);
                }
            } else {
                throw parseError("Document has trailing tokens after first object or array: "
                        + t);
            }
        }

        // Parse a given input stream into a single value node. Used when doing a replace inside a ConfigDocument.
        com.gu.typesafe.config.impl.AbstractConfigNodeValue parseSingleValue() {
            com.gu.typesafe.config.impl.Token t = nextToken();
            if (t == com.gu.typesafe.config.impl.Tokens.START) {
                // OK
            } else {
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                        "token stream did not begin with START, had " + t);
            }

            t = nextToken();
            if (com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(t) || com.gu.typesafe.config.impl.Tokens.isNewline(t) || isUnquotedWhitespace(t) || com.gu.typesafe.config.impl.Tokens.isComment(t)) {
                throw parseError("The value from withValueText cannot have leading or trailing newlines, whitespace, or comments");
            }
            if (t == com.gu.typesafe.config.impl.Tokens.END) {
                throw parseError("Empty value");
            }
            if (flavor == ConfigSyntax.JSON) {
                com.gu.typesafe.config.impl.AbstractConfigNodeValue node = parseValue(t);
                t = nextToken();
                if (t == com.gu.typesafe.config.impl.Tokens.END) {
                    return node;
                } else {
                    throw parseError("Parsing JSON and the value set in withValueText was either a concatenation or " +
                                        "had trailing whitespace, newlines, or comments");
                }
            } else {
                putBack(t);
                ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> nodes = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>();
                com.gu.typesafe.config.impl.AbstractConfigNodeValue node = consolidateValues(nodes);
                t = nextToken();
                if (t == com.gu.typesafe.config.impl.Tokens.END) {
                    return node;
                } else {
                    throw parseError("The value from withValueText cannot have leading or trailing newlines, whitespace, or comments");
                }
            }
        }
    }
}
