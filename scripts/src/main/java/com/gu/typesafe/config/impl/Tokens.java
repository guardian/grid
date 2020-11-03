/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.util.List;

import com.gu.typesafe.config.ConfigException;
import com.gu.typesafe.config.ConfigOrigin;
import com.gu.typesafe.config.ConfigValueType;

/* FIXME the way the subclasses of Token are private with static isFoo and accessors is kind of ridiculous. */
final class Tokens {
    static private class Value extends Token {

        final private com.gu.typesafe.config.impl.AbstractConfigValue value;

        Value(com.gu.typesafe.config.impl.AbstractConfigValue value) {
            this(value, null);
        }

        Value(com.gu.typesafe.config.impl.AbstractConfigValue value, String origText) {
            super(com.gu.typesafe.config.impl.TokenType.VALUE, value.origin(), origText);
            this.value = value;
        }

        com.gu.typesafe.config.impl.AbstractConfigValue value() {
            return value;
        }

        @Override
        public String toString() {
            if (value().resolveStatus() == ResolveStatus.RESOLVED)
                return "'" + value().unwrapped() + "' (" + value.valueType().name() + ")";
            else
                return "'<unresolved value>' (" + value.valueType().name() + ")";
        }

        @Override
        protected boolean canEqual(Object other) {
            return other instanceof Value;
        }

        @Override
        public boolean equals(Object other) {
            return super.equals(other) && ((Value) other).value.equals(value);
        }

        @Override
        public int hashCode() {
            return 41 * (41 + super.hashCode()) + value.hashCode();
        }
    }

    static private class Line extends Token {
        Line(com.gu.typesafe.config.ConfigOrigin origin) {
            super(com.gu.typesafe.config.impl.TokenType.NEWLINE, origin);
        }

        @Override
        public String toString() {
            return "'\\n'@" + lineNumber();
        }

        @Override
        protected boolean canEqual(Object other) {
            return other instanceof Line;
        }

        @Override
        public boolean equals(Object other) {
            return super.equals(other) && ((Line) other).lineNumber() == lineNumber();
        }

        @Override
        public int hashCode() {
            return 41 * (41 + super.hashCode()) + lineNumber();
        }

        @Override
        public String tokenText() {
            return "\n";
        }
    }

    // This is not a Value, because it requires special processing
    static private class UnquotedText extends Token {
        final private String value;

        UnquotedText(com.gu.typesafe.config.ConfigOrigin origin, String s) {
            super(com.gu.typesafe.config.impl.TokenType.UNQUOTED_TEXT, origin);
            this.value = s;
        }

        String value() {
            return value;
        }

        @Override
        public String toString() {
            return "'" + value + "'";
        }

        @Override
        protected boolean canEqual(Object other) {
            return other instanceof UnquotedText;
        }

        @Override
        public boolean equals(Object other) {
            return super.equals(other)
                    && ((UnquotedText) other).value.equals(value);
        }

        @Override
        public int hashCode() {
            return 41 * (41 + super.hashCode()) + value.hashCode();
        }

        @Override
        public String tokenText() {
            return value;
        }
    }

    static private class IgnoredWhitespace extends Token {
        final private String value;

        IgnoredWhitespace(com.gu.typesafe.config.ConfigOrigin origin, String s) {
            super(com.gu.typesafe.config.impl.TokenType.IGNORED_WHITESPACE, origin);
            this.value = s;
        }

        @Override
        public String toString() { return "'" + value + "' (WHITESPACE)"; }

        @Override
        protected boolean canEqual(Object other) {
            return other instanceof IgnoredWhitespace;
        }

        @Override
        public boolean equals(Object other) {
            return super.equals(other)
                && ((IgnoredWhitespace) other).value.equals(value);
        }

        @Override
        public int hashCode() {
            return 41 * (41 + super.hashCode()) + value.hashCode();
        }

        @Override
        public String tokenText() {
            return value;
        }
    }

    static private class Problem extends Token {
        final private String what;
        final private String message;
        final private boolean suggestQuotes;
        final private Throwable cause;

        Problem(com.gu.typesafe.config.ConfigOrigin origin, String what, String message, boolean suggestQuotes,
                Throwable cause) {
            super(com.gu.typesafe.config.impl.TokenType.PROBLEM, origin);
            this.what = what;
            this.message = message;
            this.suggestQuotes = suggestQuotes;
            this.cause = cause;
        }

        String what() {
            return what;
        }

        String message() {
            return message;
        }

        boolean suggestQuotes() {
            return suggestQuotes;
        }

        Throwable cause() {
            return cause;
        }

        @Override
        public String toString() {
            StringBuilder sb = new StringBuilder();
            sb.append('\'');
            sb.append(what);
            sb.append('\'');
            sb.append(" (");
            sb.append(message);
            sb.append(")");
            return sb.toString();
        }

        @Override
        protected boolean canEqual(Object other) {
            return other instanceof Problem;
        }

        @Override
        public boolean equals(Object other) {
            return super.equals(other) && ((Problem) other).what.equals(what)
                    && ((Problem) other).message.equals(message)
                    && ((Problem) other).suggestQuotes == suggestQuotes
                    && ConfigImplUtil.equalsHandlingNull(((Problem) other).cause, cause);
        }

        @Override
        public int hashCode() {
            int h = 41 * (41 + super.hashCode());
            h = 41 * (h + what.hashCode());
            h = 41 * (h + message.hashCode());
            h = 41 * (h + Boolean.valueOf(suggestQuotes).hashCode());
            if (cause != null)
                h = 41 * (h + cause.hashCode());
            return h;
        }
    }

    static private abstract class Comment extends Token {
        final private String text;

        Comment(com.gu.typesafe.config.ConfigOrigin origin, String text) {
            super(com.gu.typesafe.config.impl.TokenType.COMMENT, origin);
            this.text = text;
        }

        final static class DoubleSlashComment extends Comment {
            DoubleSlashComment(com.gu.typesafe.config.ConfigOrigin origin, String text) {
                super(origin, text);
            }

            @Override
            public String tokenText() {
                return "//" + super.text;
            }
        }

        final static class HashComment extends Comment {
            HashComment(com.gu.typesafe.config.ConfigOrigin origin, String text) {
                super(origin, text);
            }

            @Override
            public String tokenText() {
                return "#" + super.text;
            }
        }

        String text() {
            return text;
        }

        @Override
        public String toString() {
            StringBuilder sb = new StringBuilder();
            sb.append("'#");
            sb.append(text);
            sb.append("' (COMMENT)");
            return sb.toString();
        }

        @Override
        protected boolean canEqual(Object other) {
            return other instanceof Comment;
        }

        @Override
        public boolean equals(Object other) {
            return super.equals(other) && ((Comment) other).text.equals(text);
        }

        @Override
        public int hashCode() {
            int h = 41 * (41 + super.hashCode());
            h = 41 * (h + text.hashCode());
            return h;
        }
    }

    // This is not a Value, because it requires special processing
    static private class Substitution extends Token {
        final private boolean optional;
        final private List<Token> value;

        Substitution(com.gu.typesafe.config.ConfigOrigin origin, boolean optional, List<Token> expression) {
            super(com.gu.typesafe.config.impl.TokenType.SUBSTITUTION, origin);
            this.optional = optional;
            this.value = expression;
        }

        boolean optional() {
            return optional;
        }

        List<Token> value() {
            return value;
        }

        @Override
        public String tokenText() {
            return "${" + (this.optional? "?" : "") + Tokenizer.render(this.value.iterator()) + "}";
        }

        @Override
        public String toString() {
            StringBuilder sb = new StringBuilder();
            for (Token t : value) {
                sb.append(t.toString());
            }
            return "'${" + sb.toString() + "}'";
        }

        @Override
        protected boolean canEqual(Object other) {
            return other instanceof Substitution;
        }

        @Override
        public boolean equals(Object other) {
            return super.equals(other)
                    && ((Substitution) other).value.equals(value);
        }

        @Override
        public int hashCode() {
            return 41 * (41 + super.hashCode()) + value.hashCode();
        }
    }

    static boolean isValue(Token token) {
        return token instanceof Value;
    }

    static com.gu.typesafe.config.impl.AbstractConfigValue getValue(Token token) {
        if (token instanceof Value) {
            return ((Value) token).value();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "tried to get value of non-value token " + token);
        }
    }

    static boolean isValueWithType(Token t, ConfigValueType valueType) {
        return isValue(t) && getValue(t).valueType() == valueType;
    }

    static boolean isNewline(Token token) {
        return token instanceof Line;
    }

    static boolean isProblem(Token token) {
        return token instanceof Problem;
    }

    static String getProblemWhat(Token token) {
        if (token instanceof Problem) {
            return ((Problem) token).what();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("tried to get problem what from " + token);
        }
    }

    static String getProblemMessage(Token token) {
        if (token instanceof Problem) {
            return ((Problem) token).message();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("tried to get problem message from " + token);
        }
    }

    static boolean getProblemSuggestQuotes(Token token) {
        if (token instanceof Problem) {
            return ((Problem) token).suggestQuotes();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("tried to get problem suggestQuotes from "
                    + token);
        }
    }

    static Throwable getProblemCause(Token token) {
        if (token instanceof Problem) {
            return ((Problem) token).cause();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("tried to get problem cause from " + token);
        }
    }

    static boolean isComment(Token token) {
        return token instanceof Comment;
    }

    static String getCommentText(Token token) {
        if (token instanceof Comment) {
            return ((Comment) token).text();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("tried to get comment text from " + token);
        }
    }

    static boolean isUnquotedText(Token token) {
        return token instanceof UnquotedText;
    }

    static String getUnquotedText(Token token) {
        if (token instanceof UnquotedText) {
            return ((UnquotedText) token).value();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "tried to get unquoted text from " + token);
        }
    }

    static boolean isIgnoredWhitespace(Token token) {
        return token instanceof IgnoredWhitespace;
    }

    static boolean isSubstitution(Token token) {
        return token instanceof Substitution;
    }

    static List<Token> getSubstitutionPathExpression(Token token) {
        if (token instanceof Substitution) {
            return ((Substitution) token).value();
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "tried to get substitution from " + token);
        }
    }

    static boolean getSubstitutionOptional(Token token) {
        if (token instanceof Substitution) {
            return ((Substitution) token).optional();
        } else {
            throw new ConfigException.BugOrBroken("tried to get substitution optionality from "
                    + token);
        }
    }

    final static Token START = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.START, "start of file", "");
    final static Token END = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.END, "end of file", "");
    final static Token COMMA = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.COMMA, "','", ",");
    final static Token EQUALS = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.EQUALS, "'='", "=");
    final static Token COLON = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.COLON, "':'", ":");
    final static Token OPEN_CURLY = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.OPEN_CURLY, "'{'", "{");
    final static Token CLOSE_CURLY = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.CLOSE_CURLY, "'}'", "}");
    final static Token OPEN_SQUARE = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.OPEN_SQUARE, "'['", "[");
    final static Token CLOSE_SQUARE = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.CLOSE_SQUARE, "']'", "]");
    final static Token PLUS_EQUALS = Token.newWithoutOrigin(com.gu.typesafe.config.impl.TokenType.PLUS_EQUALS, "'+='", "+=");

    static Token newLine(com.gu.typesafe.config.ConfigOrigin origin) {
        return new Line(origin);
    }

    static Token newProblem(com.gu.typesafe.config.ConfigOrigin origin, String what, String message,
                            boolean suggestQuotes, Throwable cause) {
        return new Problem(origin, what, message, suggestQuotes, cause);
    }

    static Token newCommentDoubleSlash(com.gu.typesafe.config.ConfigOrigin origin, String text) {
        return new Comment.DoubleSlashComment(origin, text);
    }

    static Token newCommentHash(com.gu.typesafe.config.ConfigOrigin origin, String text) {
        return new Comment.HashComment(origin, text);
    }

    static Token newUnquotedText(com.gu.typesafe.config.ConfigOrigin origin, String s) {
        return new UnquotedText(origin, s);
    }

    static Token newIgnoredWhitespace(com.gu.typesafe.config.ConfigOrigin origin, String s) {
        return new IgnoredWhitespace(origin, s);
    }

    static Token newSubstitution(com.gu.typesafe.config.ConfigOrigin origin, boolean optional, List<Token> expression) {
        return new Substitution(origin, optional, expression);
    }

    static Token newValue(com.gu.typesafe.config.impl.AbstractConfigValue value) {
        return new Value(value);
    }
    static Token newValue(com.gu.typesafe.config.impl.AbstractConfigValue value, String origText) {
        return new Value(value, origText);
    }

    static Token newString(com.gu.typesafe.config.ConfigOrigin origin, String value, String origText) {
        return newValue(new ConfigString.Quoted(origin, value), origText);
    }

    static Token newInt(com.gu.typesafe.config.ConfigOrigin origin, int value, String origText) {
        return newValue(com.gu.typesafe.config.impl.ConfigNumber.newNumber(origin, value,
                origText), origText);
    }

    static Token newDouble(com.gu.typesafe.config.ConfigOrigin origin, double value,
                           String origText) {
        return newValue(com.gu.typesafe.config.impl.ConfigNumber.newNumber(origin, value,
                origText), origText);
    }

    static Token newLong(com.gu.typesafe.config.ConfigOrigin origin, long value, String origText) {
        return newValue(com.gu.typesafe.config.impl.ConfigNumber.newNumber(origin, value,
                origText), origText);
    }

    static Token newNull(com.gu.typesafe.config.ConfigOrigin origin) {
        return newValue(new com.gu.typesafe.config.impl.ConfigNull(origin), "null");
    }

    static Token newBoolean(ConfigOrigin origin, boolean value) {
        return newValue(new ConfigBoolean(origin, value), "" + value);
    }
}
