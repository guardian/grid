package com.gu.typesafe.config.impl;

/**
 * This exists because we have to memoize resolved substitutions as we go
 * through the config tree; otherwise we could end up creating multiple copies
 * of values or whole trees of values as we follow chains of substitutions.
 */
final class ResolveMemos {
    // note that we can resolve things to undefined (represented as Java null,
    // rather than ConfigNull) so this map can have null values.
    final private BadMap<MemoKey, com.gu.typesafe.config.impl.AbstractConfigValue> memos;

    private ResolveMemos(BadMap<MemoKey, com.gu.typesafe.config.impl.AbstractConfigValue> memos) {
        this.memos = memos;
    }

    ResolveMemos() {
        this(new BadMap<>());
    }

    com.gu.typesafe.config.impl.AbstractConfigValue get(MemoKey key) {
        return memos.get(key);
    }

    ResolveMemos put(MemoKey key, com.gu.typesafe.config.impl.AbstractConfigValue value) {
        return new ResolveMemos(memos.copyingPut(key, value));
    }
}
