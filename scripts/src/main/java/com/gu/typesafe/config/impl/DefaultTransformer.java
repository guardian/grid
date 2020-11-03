/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;

import com.gu.typesafe.config.ConfigValueType;

/**
 * Default automatic type transformations.
 */
final class DefaultTransformer {

    static com.gu.typesafe.config.impl.AbstractConfigValue transform(com.gu.typesafe.config.impl.AbstractConfigValue value,
                                                                     com.gu.typesafe.config.ConfigValueType requested) {
        if (value.valueType() == com.gu.typesafe.config.ConfigValueType.STRING) {
            String s = (String) value.unwrapped();
            switch (requested) {
            case NUMBER:
                try {
                    Long v = Long.parseLong(s);
                    return new com.gu.typesafe.config.impl.ConfigLong(value.origin(), v, s);
                } catch (NumberFormatException e) {
                    // try Double
                }
                try {
                    Double v = Double.parseDouble(s);
                    return new com.gu.typesafe.config.impl.ConfigDouble(value.origin(), v, s);
                } catch (NumberFormatException e) {
                    // oh well.
                }
                break;
            case NULL:
                if (s.equals("null"))
                    return new com.gu.typesafe.config.impl.ConfigNull(value.origin());
                break;
            case BOOLEAN:
                if (s.equals("true") || s.equals("yes") || s.equals("on")) {
                    return new com.gu.typesafe.config.impl.ConfigBoolean(value.origin(), true);
                } else if (s.equals("false") || s.equals("no")
                        || s.equals("off")) {
                    return new com.gu.typesafe.config.impl.ConfigBoolean(value.origin(), false);
                }
                break;
            case LIST:
                // can't go STRING to LIST automatically
                break;
            case OBJECT:
                // can't go STRING to OBJECT automatically
                break;
            case STRING:
                // no-op STRING to STRING
                break;
            }
        } else if (requested == com.gu.typesafe.config.ConfigValueType.STRING) {
            // if we converted null to string here, then you wouldn't properly
            // get a missing-value error if you tried to get a null value
            // as a string.
            switch (value.valueType()) {
            case NUMBER: // FALL THROUGH
            case BOOLEAN:
                return new com.gu.typesafe.config.impl.ConfigString.Quoted(value.origin(),
                        value.transformToString());
            case NULL:
                // want to be sure this throws instead of returning "null" as a
                // string
                break;
            case OBJECT:
                // no OBJECT to STRING automatically
                break;
            case LIST:
                // no LIST to STRING automatically
                break;
            case STRING:
                // no-op STRING to STRING
                break;
            }
        } else if (requested == com.gu.typesafe.config.ConfigValueType.LIST && value.valueType() == ConfigValueType.OBJECT) {
            // attempt to convert an array-like (numeric indices) object to a
            // list. This would be used with .properties syntax for example:
            // -Dfoo.0=bar -Dfoo.1=baz
            // To ensure we still throw type errors for objects treated
            // as lists in most cases, we'll refuse to convert if the object
            // does not contain any numeric keys. This means we don't allow
            // empty objects here though :-/
            AbstractConfigObject o = (AbstractConfigObject) value;
            Map<Integer, com.gu.typesafe.config.impl.AbstractConfigValue> values = new HashMap<Integer, com.gu.typesafe.config.impl.AbstractConfigValue>();
            for (String key : o.keySet()) {
                int i;
                try {
                    i = Integer.parseInt(key, 10);
                    if (i < 0)
                        continue;
                    values.put(i, o.get(key));
                } catch (NumberFormatException e) {
                    continue;
                }
            }
            if (!values.isEmpty()) {
                ArrayList<Map.Entry<Integer, com.gu.typesafe.config.impl.AbstractConfigValue>> entryList = new ArrayList<Map.Entry<Integer, com.gu.typesafe.config.impl.AbstractConfigValue>>(
                        values.entrySet());
                // sort by numeric index
                Collections.sort(entryList,
                        new Comparator<Map.Entry<Integer, com.gu.typesafe.config.impl.AbstractConfigValue>>() {
                            @Override
                            public int compare(Map.Entry<Integer, com.gu.typesafe.config.impl.AbstractConfigValue> a,
                                    Map.Entry<Integer, com.gu.typesafe.config.impl.AbstractConfigValue> b) {
                                return Integer.compare(a.getKey(), b.getKey());
                            }
                        });
                // drop the indices (we allow gaps in the indices, for better or
                // worse)
                ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue> list = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>();
                for (Map.Entry<Integer, com.gu.typesafe.config.impl.AbstractConfigValue> entry : entryList) {
                    list.add(entry.getValue());
                }
                return new com.gu.typesafe.config.impl.SimpleConfigList(value.origin(), list);
            }
        }

        return value;
    }
}
