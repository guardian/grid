package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigRenderOptions;
import com.gu.typesafe.config.parser.ConfigDocument;

import java.io.StringReader;
import java.util.Iterator;

final class SimpleConfigDocument implements com.gu.typesafe.config.parser.ConfigDocument {
    private ConfigNodeRoot configNodeTree;
    private com.gu.typesafe.config.ConfigParseOptions parseOptions;

    SimpleConfigDocument(ConfigNodeRoot parsedNode, com.gu.typesafe.config.ConfigParseOptions parseOptions) {
        configNodeTree = parsedNode;
        this.parseOptions = parseOptions;
    }

    @Override
    public com.gu.typesafe.config.parser.ConfigDocument withValueText(String path, String newValue) {
        if (newValue == null)
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("null value for " + path + " passed to withValueText");
        SimpleConfigOrigin origin = SimpleConfigOrigin.newSimple("single value parsing");
        StringReader reader = new StringReader(newValue);
        Iterator<Token> tokens = Tokenizer.tokenize(origin, reader, parseOptions.getSyntax());
        com.gu.typesafe.config.impl.AbstractConfigNodeValue parsedValue = ConfigDocumentParser.parseValue(tokens, origin, parseOptions);
        reader.close();

        return new SimpleConfigDocument(configNodeTree.setValue(path, parsedValue, parseOptions.getSyntax()), parseOptions);
    }

    @Override
    public com.gu.typesafe.config.parser.ConfigDocument withValue(String path, com.gu.typesafe.config.ConfigValue newValue) {
        if (newValue == null)
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("null value for " + path + " passed to withValue");
        com.gu.typesafe.config.ConfigRenderOptions options = ConfigRenderOptions.defaults();
        options = options.setOriginComments(false);
        return withValueText(path, newValue.render(options).trim());
    }

    @Override
    public com.gu.typesafe.config.parser.ConfigDocument withoutPath(String path) {
        return new SimpleConfigDocument(configNodeTree.setValue(path, null, parseOptions.getSyntax()), parseOptions);
    }

    @Override
    public boolean hasPath(String path) {
        return configNodeTree.hasValue(path);
    }

    public String render() {
        return configNodeTree.render();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof com.gu.typesafe.config.parser.ConfigDocument && render().equals(((ConfigDocument) other).render());
    }

    @Override
    public int hashCode() {
        return render().hashCode();
    }
}
