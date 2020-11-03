package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigSyntax;

import java.util.ArrayList;
import java.util.Collection;

final class ConfigNodeObject extends com.gu.typesafe.config.impl.ConfigNodeComplexValue {
    ConfigNodeObject(Collection<AbstractConfigNode> children) {
        super(children);
    }

    @Override
    protected ConfigNodeObject newNode(Collection<AbstractConfigNode> nodes) {
        return new ConfigNodeObject(nodes);
    }

    public boolean hasValue(Path desiredPath) {
        for (AbstractConfigNode node : children) {
            if (node instanceof ConfigNodeField) {
                ConfigNodeField field = (ConfigNodeField) node;
                Path key = field.path().value();
                if (key.equals(desiredPath) || key.startsWith(desiredPath)) {
                    return true;
                } else if (desiredPath.startsWith(key)) {
                    if (field.value() instanceof ConfigNodeObject) {
                        ConfigNodeObject obj = (ConfigNodeObject) field.value();
                        Path remainingPath = desiredPath.subPath(key.length());
                        if (obj.hasValue(remainingPath)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    protected ConfigNodeObject changeValueOnPath(Path desiredPath, com.gu.typesafe.config.impl.AbstractConfigNodeValue value, com.gu.typesafe.config.ConfigSyntax flavor) {
        ArrayList<AbstractConfigNode> childrenCopy = new ArrayList<AbstractConfigNode>(super.children);
        boolean seenNonMatching = false;
        // Copy the value so we can change it to null but not modify the original parameter
        com.gu.typesafe.config.impl.AbstractConfigNodeValue valueCopy = value;
        for (int i = childrenCopy.size() - 1; i >= 0; i--) {
            if (childrenCopy.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken) {
                Token t = ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) childrenCopy.get(i)).token();
                // Ensure that, when we are removing settings in JSON, we don't end up with a trailing comma
                if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON && !seenNonMatching && t == com.gu.typesafe.config.impl.Tokens.COMMA) {
                    childrenCopy.remove(i);
                }
                continue;
            } else if (!(childrenCopy.get(i) instanceof ConfigNodeField)) {
                continue;
            }
            ConfigNodeField node = (ConfigNodeField) childrenCopy.get(i);
            Path key = node.path().value();

            // Delete all multi-element paths that start with the desired path, since technically they are duplicates
            if ((valueCopy == null && key.equals(desiredPath))|| (key.startsWith(desiredPath) && !key.equals(desiredPath))) {
                childrenCopy.remove(i);
                // Remove any whitespace or commas after the deleted setting
                for (int j = i; j < childrenCopy.size(); j++) {
                    if (childrenCopy.get(j) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken) {
                        Token t = ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) childrenCopy.get(j)).token();
                        if (com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(t) || t == com.gu.typesafe.config.impl.Tokens.COMMA) {
                            childrenCopy.remove(j);
                            j--;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            } else if (key.equals(desiredPath)) {
                seenNonMatching = true;
                com.gu.typesafe.config.impl.AbstractConfigNodeValue indentedValue;
                AbstractConfigNode before = i - 1 > 0 ? childrenCopy.get(i - 1) : null;
                if (value instanceof com.gu.typesafe.config.impl.ConfigNodeComplexValue &&
                        before instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                        com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) before).token()))
                    indentedValue = ((com.gu.typesafe.config.impl.ConfigNodeComplexValue) value).indentText(before);
                else
                    indentedValue = value;
                childrenCopy.set(i, node.replaceValue(indentedValue));
                valueCopy = null;
            } else if (desiredPath.startsWith(key)) {
                seenNonMatching = true;
                if (node.value() instanceof ConfigNodeObject) {
                    Path remainingPath = desiredPath.subPath(key.length());
                    childrenCopy.set(i, node.replaceValue(((ConfigNodeObject) node.value()).changeValueOnPath(remainingPath, valueCopy, flavor)));
                    if (valueCopy != null && !node.equals(super.children.get(i)))
                        valueCopy = null;
                }
            } else {
                seenNonMatching = true;
            }
        }
        return new ConfigNodeObject(childrenCopy);
    }

    public ConfigNodeObject setValueOnPath(String desiredPath, com.gu.typesafe.config.impl.AbstractConfigNodeValue value) {
        return setValueOnPath(desiredPath, value, com.gu.typesafe.config.ConfigSyntax.CONF);
    }

    public ConfigNodeObject setValueOnPath(String desiredPath, com.gu.typesafe.config.impl.AbstractConfigNodeValue value, com.gu.typesafe.config.ConfigSyntax flavor) {
        com.gu.typesafe.config.impl.ConfigNodePath path = com.gu.typesafe.config.impl.PathParser.parsePathNode(desiredPath, flavor);
        return setValueOnPath(path, value, flavor);
    }

    private ConfigNodeObject setValueOnPath(com.gu.typesafe.config.impl.ConfigNodePath desiredPath, com.gu.typesafe.config.impl.AbstractConfigNodeValue value, com.gu.typesafe.config.ConfigSyntax flavor) {
        ConfigNodeObject node = changeValueOnPath(desiredPath.value(), value, flavor);

        // If the desired Path did not exist, add it
        if (!node.hasValue(desiredPath.value())) {
            return node.addValueOnPath(desiredPath, value, flavor);
        }
        return node;
    }

    private Collection<AbstractConfigNode> indentation() {
        boolean seenNewLine = false;
        ArrayList<AbstractConfigNode> indentation = new ArrayList<AbstractConfigNode>();
        if (children.isEmpty()) {
            return indentation;
        }
        for (int i = 0; i < children.size(); i++) {
            if (!seenNewLine) {
                if (children.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                        com.gu.typesafe.config.impl.Tokens.isNewline(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) children.get(i)).token())) {
                    seenNewLine = true;
                    indentation.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.newLine(null)));
                }
            } else {
                if (children.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                        com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) children.get(i)).token()) &&
                        i + 1 < children.size() && (children.get(i+1) instanceof ConfigNodeField ||
                        children.get(i+1) instanceof ConfigNodeInclude)) {
                    // Return the indentation of the first setting on its own line
                    indentation.add(children.get(i));
                    return indentation;
                }
            }
        }
        if (indentation.isEmpty()) {
            indentation.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.newIgnoredWhitespace(null, " ")));
        } else {
            // Calculate the indentation of the ending curly-brace to get the indentation of the root object
            AbstractConfigNode last = children.get(children.size() - 1);
            if (last instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken && ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) last).token() == com.gu.typesafe.config.impl.Tokens.CLOSE_CURLY) {
                AbstractConfigNode beforeLast = children.get(children.size() - 2);
                String indent = "";
                if (beforeLast instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                        com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) beforeLast).token()))
                    indent = ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) beforeLast).token().tokenText();
                indent += "  ";
                indentation.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.newIgnoredWhitespace(null, indent)));
                return indentation;
            }
        }

        // The object has no curly braces and is at the root level, so don't indent
        return indentation;
    }

    protected ConfigNodeObject addValueOnPath(com.gu.typesafe.config.impl.ConfigNodePath desiredPath, com.gu.typesafe.config.impl.AbstractConfigNodeValue value, com.gu.typesafe.config.ConfigSyntax flavor) {
        Path path = desiredPath.value();
        ArrayList<AbstractConfigNode> childrenCopy = new ArrayList<AbstractConfigNode>(super.children);
        ArrayList<AbstractConfigNode> indentation = new ArrayList<AbstractConfigNode>(indentation());

        // If the value we're inserting is a complex value, we'll need to indent it for insertion
        com.gu.typesafe.config.impl.AbstractConfigNodeValue indentedValue;
        if (value instanceof com.gu.typesafe.config.impl.ConfigNodeComplexValue && !indentation.isEmpty()) {
            indentedValue = ((com.gu.typesafe.config.impl.ConfigNodeComplexValue) value).indentText(indentation.get(indentation.size() - 1));
        } else {
            indentedValue = value;
        }
        boolean sameLine = !(indentation.size() > 0 && indentation.get(0) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                                com.gu.typesafe.config.impl.Tokens.isNewline(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) indentation.get(0)).token()));

        // If the path is of length greater than one, see if the value needs to be added further down
        if (path.length() > 1) {
            for (int i = super.children.size() - 1; i >= 0; i--) {
                if (!(super.children.get(i) instanceof ConfigNodeField)) {
                    continue;
                }
                ConfigNodeField node = (ConfigNodeField) super.children.get(i);
                Path key = node.path().value();
                if (path.startsWith(key) && node.value() instanceof ConfigNodeObject) {
                    com.gu.typesafe.config.impl.ConfigNodePath remainingPath = desiredPath.subPath(key.length());
                    ConfigNodeObject newValue = (ConfigNodeObject) node.value();
                    childrenCopy.set(i, node.replaceValue(newValue.addValueOnPath(remainingPath, value, flavor)));
                    return new ConfigNodeObject(childrenCopy);
                }
            }
        }

        // Otherwise, construct the new setting
        boolean startsWithBrace = !super.children.isEmpty() && super.children.get(0) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) super.children.get(0)).token() == com.gu.typesafe.config.impl.Tokens.OPEN_CURLY;
        ArrayList<AbstractConfigNode> newNodes = new ArrayList<AbstractConfigNode>();
        newNodes.addAll(indentation);
        newNodes.add(desiredPath.first());
        newNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.newIgnoredWhitespace(null, " ")));
        newNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.COLON));
        newNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.newIgnoredWhitespace(null, " ")));

        if (path.length() == 1) {
            newNodes.add(indentedValue);
        } else {
            // If the path is of length greater than one add the required new objects along the path
            ArrayList<AbstractConfigNode> newObjectNodes = new ArrayList<AbstractConfigNode>();
            newObjectNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.OPEN_CURLY));
            if (indentation.isEmpty()) {
                newObjectNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.newLine(null)));
            }
            newObjectNodes.addAll(indentation);
            newObjectNodes.add(new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.CLOSE_CURLY));
            ConfigNodeObject newObject = new ConfigNodeObject(newObjectNodes);
            newNodes.add(newObject.addValueOnPath(desiredPath.subPath(1), indentedValue, flavor));
        }

        // Combine these two cases so that we only have to iterate once
        if (flavor == com.gu.typesafe.config.ConfigSyntax.JSON || startsWithBrace || sameLine) {
            for (int i = childrenCopy.size() - 1; i >= 0; i--) {

                // If we are in JSON or are adding a setting on the same line, we need to add a comma to the
                // last setting
                if ((flavor == com.gu.typesafe.config.ConfigSyntax.JSON || sameLine) && childrenCopy.get(i) instanceof ConfigNodeField) {
                    if (i+1 >= childrenCopy.size() ||
                            !(childrenCopy.get(i+1) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken
                                    && ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) childrenCopy.get(i+1)).token() == com.gu.typesafe.config.impl.Tokens.COMMA))
                    childrenCopy.add(i+1, new com.gu.typesafe.config.impl.ConfigNodeSingleToken(com.gu.typesafe.config.impl.Tokens.COMMA));
                    break;
                }

                // Add the value into the copy of the children map, keeping any whitespace/newlines
                // before the close curly brace
                if (startsWithBrace && childrenCopy.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                        ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) childrenCopy.get(i)).token == com.gu.typesafe.config.impl.Tokens.CLOSE_CURLY) {
                    AbstractConfigNode previous = childrenCopy.get(i - 1);
                    if (previous instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                            com.gu.typesafe.config.impl.Tokens.isNewline(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) previous).token())) {
                        childrenCopy.add(i - 1, new ConfigNodeField(newNodes));
                        i--;
                    } else if (previous instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                                com.gu.typesafe.config.impl.Tokens.isIgnoredWhitespace(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) previous).token())) {
                        AbstractConfigNode beforePrevious = childrenCopy.get(i - 2);
                        if (sameLine) {
                            childrenCopy.add(i - 1, new ConfigNodeField(newNodes));
                            i--;
                        }
                        else if (beforePrevious instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                                    com.gu.typesafe.config.impl.Tokens.isNewline(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) beforePrevious).token())) {
                            childrenCopy.add(i - 2, new ConfigNodeField(newNodes));
                            i -= 2;
                        } else {
                            childrenCopy.add(i, new ConfigNodeField(newNodes));
                        }

                    }
                    else
                        childrenCopy.add(i, new ConfigNodeField(newNodes));
                }
            }
        }
        if (!startsWithBrace) {
            if (!childrenCopy.isEmpty() && childrenCopy.get(childrenCopy.size() - 1) instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken &&
                 com.gu.typesafe.config.impl.Tokens.isNewline(((com.gu.typesafe.config.impl.ConfigNodeSingleToken) childrenCopy.get(childrenCopy.size() - 1)).token()))
                childrenCopy.add(childrenCopy.size() - 1, new ConfigNodeField(newNodes));
            else
                childrenCopy.add(new ConfigNodeField(newNodes));
        }
        return new ConfigNodeObject(childrenCopy);
    }

    public ConfigNodeObject removeValueOnPath(String desiredPath, ConfigSyntax flavor) {
        Path path = com.gu.typesafe.config.impl.PathParser.parsePathNode(desiredPath, flavor).value();
        return changeValueOnPath(path, null, flavor);
    }
}
