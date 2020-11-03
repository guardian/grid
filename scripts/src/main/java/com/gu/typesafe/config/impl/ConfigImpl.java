/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.io.File;
import java.lang.ref.WeakReference;
import java.net.URL;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Callable;

import com.gu.typesafe.config.*;
import com.gu.typesafe.config.ConfigMemorySize;

/**
 * Internal implementation detail, not ABI stable, do not touch.
 * For use only by the {@link com.typesafe.config} package.
 */
public class ConfigImpl {
    private static final String ENV_VAR_OVERRIDE_PREFIX = "CONFIG_FORCE_";

    private static class LoaderCache {
        private com.gu.typesafe.config.Config currentSystemProperties;
        private WeakReference<ClassLoader> currentLoader;
        private Map<String, com.gu.typesafe.config.Config> cache;

        LoaderCache() {
            this.currentSystemProperties = null;
            this.currentLoader = new WeakReference<ClassLoader>(null);
            this.cache = new HashMap<String, com.gu.typesafe.config.Config>();
        }

        // for now, caching as long as the loader remains the same,
        // drop entire cache if it changes.
        synchronized com.gu.typesafe.config.Config getOrElseUpdate(ClassLoader loader, String key, Callable<com.gu.typesafe.config.Config> updater) {
            if (loader != currentLoader.get()) {
                // reset the cache if we start using a different loader
                cache.clear();
                currentLoader = new WeakReference<ClassLoader>(loader);
            }

            com.gu.typesafe.config.Config systemProperties = systemPropertiesAsConfig();
            if (systemProperties != currentSystemProperties) {
                cache.clear();
                currentSystemProperties = systemProperties;
            }

            com.gu.typesafe.config.Config config = cache.get(key);
            if (config == null) {
                try {
                    config = updater.call();
                } catch (RuntimeException e) {
                    throw e; // this will include ConfigException
                } catch (Exception e) {
                    throw new com.gu.typesafe.config.ConfigException.Generic(e.getMessage(), e);
                }
                if (config == null)
                    throw new com.gu.typesafe.config.ConfigException.BugOrBroken("null config from cache updater");
                cache.put(key, config);
            }

            return config;
        }
    }

    private static class LoaderCacheHolder {
        static final LoaderCache cache = new LoaderCache();
    }

    public static com.gu.typesafe.config.Config computeCachedConfig(ClassLoader loader, String key,
                                                                    Callable<com.gu.typesafe.config.Config> updater) {
        LoaderCache cache;
        try {
            cache = LoaderCacheHolder.cache;
        } catch (ExceptionInInitializerError e) {
            throw ConfigImplUtil.extractInitializerError(e);
        }
        return cache.getOrElseUpdate(loader, key, updater);
    }


    static class FileNameSource implements SimpleIncluder.NameSource {
        @Override
        public com.gu.typesafe.config.ConfigParseable nameToParseable(String name, com.gu.typesafe.config.ConfigParseOptions parseOptions) {
            return com.gu.typesafe.config.impl.Parseable.newFile(new File(name), parseOptions);
        }
    };

    static class ClasspathNameSource implements SimpleIncluder.NameSource {
        @Override
        public com.gu.typesafe.config.ConfigParseable nameToParseable(String name, com.gu.typesafe.config.ConfigParseOptions parseOptions) {
            return com.gu.typesafe.config.impl.Parseable.newResources(name, parseOptions);
        }
    };

    static class ClasspathNameSourceWithClass implements SimpleIncluder.NameSource {
        final private Class<?> klass;

        public ClasspathNameSourceWithClass(Class<?> klass) {
            this.klass = klass;
        }

        @Override
        public ConfigParseable nameToParseable(String name, com.gu.typesafe.config.ConfigParseOptions parseOptions) {
            return com.gu.typesafe.config.impl.Parseable.newResources(klass, name, parseOptions);
        }
    };

    public static com.gu.typesafe.config.ConfigObject parseResourcesAnySyntax(Class<?> klass, String resourceBasename,
                                                                              com.gu.typesafe.config.ConfigParseOptions baseOptions) {
        SimpleIncluder.NameSource source = new ClasspathNameSourceWithClass(klass);
        return SimpleIncluder.fromBasename(source, resourceBasename, baseOptions);
    }

    public static com.gu.typesafe.config.ConfigObject parseResourcesAnySyntax(String resourceBasename,
                                                                              com.gu.typesafe.config.ConfigParseOptions baseOptions) {
        SimpleIncluder.NameSource source = new ClasspathNameSource();
        return SimpleIncluder.fromBasename(source, resourceBasename, baseOptions);
    }

    public static com.gu.typesafe.config.ConfigObject parseFileAnySyntax(File basename, com.gu.typesafe.config.ConfigParseOptions baseOptions) {
        SimpleIncluder.NameSource source = new FileNameSource();
        return SimpleIncluder.fromBasename(source, basename.getPath(), baseOptions);
    }

    static AbstractConfigObject emptyObject(String originDescription) {
        com.gu.typesafe.config.ConfigOrigin origin = originDescription != null ? SimpleConfigOrigin
                .newSimple(originDescription) : null;
        return emptyObject(origin);
    }

    public static com.gu.typesafe.config.Config emptyConfig(String originDescription) {
        return emptyObject(originDescription).toConfig();
    }

    static AbstractConfigObject empty(com.gu.typesafe.config.ConfigOrigin origin) {
        return emptyObject(origin);
    }

    // default origin for values created with fromAnyRef and no origin specified
    final private static com.gu.typesafe.config.ConfigOrigin defaultValueOrigin = SimpleConfigOrigin
            .newSimple("hardcoded value");
    final private static ConfigBoolean defaultTrueValue = new ConfigBoolean(
            defaultValueOrigin, true);
    final private static ConfigBoolean defaultFalseValue = new ConfigBoolean(
            defaultValueOrigin, false);
    final private static com.gu.typesafe.config.impl.ConfigNull defaultNullValue = new com.gu.typesafe.config.impl.ConfigNull(
            defaultValueOrigin);
    final private static SimpleConfigList defaultEmptyList = new SimpleConfigList(
            defaultValueOrigin, Collections.<com.gu.typesafe.config.impl.AbstractConfigValue> emptyList());
    final private static SimpleConfigObject defaultEmptyObject = SimpleConfigObject
            .empty(defaultValueOrigin);

    private static SimpleConfigList emptyList(com.gu.typesafe.config.ConfigOrigin origin) {
        if (origin == null || origin == defaultValueOrigin)
            return defaultEmptyList;
        else
            return new SimpleConfigList(origin,
                    Collections.<com.gu.typesafe.config.impl.AbstractConfigValue> emptyList());
    }

    private static AbstractConfigObject emptyObject(com.gu.typesafe.config.ConfigOrigin origin) {
        // we want null origin to go to SimpleConfigObject.empty() to get the
        // origin "empty config" rather than "hardcoded value"
        if (origin == defaultValueOrigin)
            return defaultEmptyObject;
        else
            return SimpleConfigObject.empty(origin);
    }

    private static com.gu.typesafe.config.ConfigOrigin valueOrigin(String originDescription) {
        if (originDescription == null)
            return defaultValueOrigin;
        else
            return SimpleConfigOrigin.newSimple(originDescription);
    }

    public static ConfigValue fromAnyRef(Object object, String originDescription) {
        com.gu.typesafe.config.ConfigOrigin origin = valueOrigin(originDescription);
        return fromAnyRef(object, origin, FromMapMode.KEYS_ARE_KEYS);
    }

    public static com.gu.typesafe.config.ConfigObject fromPathMap(
            Map<String, ? extends Object> pathMap, String originDescription) {
        com.gu.typesafe.config.ConfigOrigin origin = valueOrigin(originDescription);
        return (ConfigObject) fromAnyRef(pathMap, origin,
                FromMapMode.KEYS_ARE_PATHS);
    }

    static com.gu.typesafe.config.impl.AbstractConfigValue fromAnyRef(Object object, com.gu.typesafe.config.ConfigOrigin origin,
                                                                      FromMapMode mapMode) {
        if (origin == null)
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "origin not supposed to be null");

        if (object == null) {
            if (origin != defaultValueOrigin)
                return new com.gu.typesafe.config.impl.ConfigNull(origin);
            else
                return defaultNullValue;
        } else if(object instanceof com.gu.typesafe.config.impl.AbstractConfigValue) {
            return (com.gu.typesafe.config.impl.AbstractConfigValue) object;
        } else if (object instanceof Boolean) {
            if (origin != defaultValueOrigin) {
                return new ConfigBoolean(origin, (Boolean) object);
            } else if ((Boolean) object) {
                return defaultTrueValue;
            } else {
                return defaultFalseValue;
            }
        } else if (object instanceof String) {
            return new ConfigString.Quoted(origin, (String) object);
        } else if (object instanceof Number) {
            // here we always keep the same type that was passed to us,
            // rather than figuring out if a Long would fit in an Int
            // or a Double has no fractional part. i.e. deliberately
            // not using ConfigNumber.newNumber() when we have a
            // Double, Integer, or Long.
            if (object instanceof Double) {
                return new com.gu.typesafe.config.impl.ConfigDouble(origin, (Double) object, null);
            } else if (object instanceof Integer) {
                return new com.gu.typesafe.config.impl.ConfigInt(origin, (Integer) object, null);
            } else if (object instanceof Long) {
                return new ConfigLong(origin, (Long) object, null);
            } else {
                return com.gu.typesafe.config.impl.ConfigNumber.newNumber(origin,
                        ((Number) object).doubleValue(), null);
            }
        } else if (object instanceof Duration) {
            return new ConfigLong(origin, ((Duration) object).toMillis(), null);
        } else if (object instanceof Map) {
            if (((Map<?, ?>) object).isEmpty())
                return emptyObject(origin);

            if (mapMode == FromMapMode.KEYS_ARE_KEYS) {
                Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> values = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>();
                for (Map.Entry<?, ?> entry : ((Map<?, ?>) object).entrySet()) {
                    Object key = entry.getKey();
                    if (!(key instanceof String))
                        throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                                "bug in method caller: not valid to create ConfigObject from map with non-String key: "
                                        + key);
                    com.gu.typesafe.config.impl.AbstractConfigValue value = fromAnyRef(entry.getValue(),
                            origin, mapMode);
                    values.put((String) key, value);
                }

                return new SimpleConfigObject(origin, values);
            } else {
                return PropertiesParser.fromPathMap(origin, (Map<?, ?>) object);
            }
        } else if (object instanceof Iterable) {
            Iterator<?> i = ((Iterable<?>) object).iterator();
            if (!i.hasNext())
                return emptyList(origin);

            List<com.gu.typesafe.config.impl.AbstractConfigValue> values = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>();
            while (i.hasNext()) {
                com.gu.typesafe.config.impl.AbstractConfigValue v = fromAnyRef(i.next(), origin, mapMode);
                values.add(v);
            }

            return new SimpleConfigList(origin, values);
        } else if (object instanceof ConfigMemorySize) {
            return new ConfigLong(origin, ((ConfigMemorySize) object).toBytes(), null);
        } else {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "bug in method caller: not valid to create ConfigValue from: "
                            + object);
        }
    }

    private static class DefaultIncluderHolder {
        static final com.gu.typesafe.config.ConfigIncluder defaultIncluder = new SimpleIncluder(null);
    }

    static ConfigIncluder defaultIncluder() {
        try {
            return DefaultIncluderHolder.defaultIncluder;
        } catch (ExceptionInInitializerError e) {
            throw ConfigImplUtil.extractInitializerError(e);
        }
    }

    private static Properties getSystemProperties() {
        // Avoid ConcurrentModificationException due to parallel setting of system properties by copying properties
        final Properties systemProperties = System.getProperties();
        final Properties systemPropertiesCopy = new Properties();
        synchronized (systemProperties) {
            for (Map.Entry<Object, Object> entry: systemProperties.entrySet()) {
                // Java 11 introduces 'java.version.date', but we don't want that to
                // overwrite 'java.version'
                if (!entry.getKey().toString().startsWith("java.version.")) {
                    systemPropertiesCopy.put(entry.getKey(), entry.getValue());
                }
            }
        }
        return systemPropertiesCopy;
    }

    private static AbstractConfigObject loadSystemProperties() {
        return (AbstractConfigObject) com.gu.typesafe.config.impl.Parseable.newProperties(getSystemProperties(),
                com.gu.typesafe.config.ConfigParseOptions.defaults().setOriginDescription("system properties")).parse();
    }

    private static class SystemPropertiesHolder {
        // this isn't final due to the reloadSystemPropertiesConfig() hack below
        static volatile AbstractConfigObject systemProperties = loadSystemProperties();
    }

    static AbstractConfigObject systemPropertiesAsConfigObject() {
        try {
            return SystemPropertiesHolder.systemProperties;
        } catch (ExceptionInInitializerError e) {
            throw ConfigImplUtil.extractInitializerError(e);
        }
    }

    public static com.gu.typesafe.config.Config systemPropertiesAsConfig() {
        return systemPropertiesAsConfigObject().toConfig();
    }

    public static void reloadSystemPropertiesConfig() {
        // ConfigFactory.invalidateCaches() relies on this having the side
        // effect that it drops all caches
        SystemPropertiesHolder.systemProperties = loadSystemProperties();
    }

    private static AbstractConfigObject loadEnvVariables() {
        return PropertiesParser.fromStringMap(newSimpleOrigin("env variables"), System.getenv());
    }

    private static class EnvVariablesHolder {
        static volatile AbstractConfigObject envVariables = loadEnvVariables();
    }

    static AbstractConfigObject envVariablesAsConfigObject() {
        try {
            return EnvVariablesHolder.envVariables;
        } catch (ExceptionInInitializerError e) {
            throw ConfigImplUtil.extractInitializerError(e);
        }
    }

    public static com.gu.typesafe.config.Config envVariablesAsConfig() {
        return envVariablesAsConfigObject().toConfig();
    }

    public static void reloadEnvVariablesConfig() {
        // ConfigFactory.invalidateCaches() relies on this having the side
        // effect that it drops all caches
        EnvVariablesHolder.envVariables = loadEnvVariables();
    }



    private static AbstractConfigObject loadEnvVariablesOverrides() {
        Map<String, String> env = new HashMap(System.getenv());
        Map<String, String> result = new HashMap();

        for (String key : env.keySet()) {
            if (key.startsWith(ENV_VAR_OVERRIDE_PREFIX)) {
                result.put(ConfigImplUtil.envVariableAsProperty(key, ENV_VAR_OVERRIDE_PREFIX), env.get(key));
            }
        }

        return PropertiesParser.fromStringMap(newSimpleOrigin("env variables overrides"), result);
    }

    private static class EnvVariablesOverridesHolder {
        static volatile AbstractConfigObject envVariables = loadEnvVariablesOverrides();
    }

    static AbstractConfigObject envVariablesOverridesAsConfigObject() {
        try {
            return EnvVariablesOverridesHolder.envVariables;
        } catch (ExceptionInInitializerError e) {
            throw ConfigImplUtil.extractInitializerError(e);
        }
    }

    public static com.gu.typesafe.config.Config envVariablesOverridesAsConfig() {
        return envVariablesOverridesAsConfigObject().toConfig();
    }

    public static void reloadEnvVariablesOverridesConfig() {
        // ConfigFactory.invalidateCaches() relies on this having the side
        // effect that it drops all caches
        EnvVariablesOverridesHolder.envVariables = loadEnvVariablesOverrides();
    }

    public static com.gu.typesafe.config.Config defaultReference(final ClassLoader loader) {
        return computeCachedConfig(loader, "defaultReference", new Callable<com.gu.typesafe.config.Config>() {
            @Override
            public com.gu.typesafe.config.Config call() {
                com.gu.typesafe.config.Config unresolvedResources = unresolvedReference(loader);
                return systemPropertiesAsConfig().withFallback(unresolvedResources).resolve();
            }
        });
    }

    private static com.gu.typesafe.config.Config unresolvedReference(final ClassLoader loader) {
        return computeCachedConfig(loader, "unresolvedReference", new Callable<com.gu.typesafe.config.Config>() {
            @Override
            public com.gu.typesafe.config.Config call() {
                return Parseable.newResources("reference.conf",
                        ConfigParseOptions.defaults().setClassLoader(loader))
                    .parse().toConfig();
            }
        });
    }

    /**
     * This returns the unresolved reference configuration, but before doing so,
     * it verifies that the reference configuration resolves, to ensure that it
     * is self contained and doesn't depend on any higher level configuration
     * files.
     */
    public static Config defaultReferenceUnresolved(final ClassLoader loader) {
        // First, verify that `reference.conf` resolves by itself.
        try {
            defaultReference(loader);
        } catch (com.gu.typesafe.config.ConfigException.UnresolvedSubstitution e) {
            throw e.addExtraDetail("Could not resolve substitution in reference.conf to a value: %s. All reference.conf files are required to be fully, independently resolvable, and should not require the presence of values for substitutions from further up the hierarchy.");
        }
        // Now load the unresolved version
        return unresolvedReference(loader);
    }


    private static class DebugHolder {
        private static String LOADS = "loads";
        private static String SUBSTITUTIONS = "substitutions";

        private static Map<String, Boolean> loadDiagnostics() {
            Map<String, Boolean> result = new HashMap<String, Boolean>();
            result.put(LOADS, false);
            result.put(SUBSTITUTIONS, false);

            // People do -Dconfig.trace=foo,bar to enable tracing of different things
            String s = System.getProperty("config.trace");
            if (s == null) {
                return result;
            } else {
                String[] keys = s.split(",");
                for (String k : keys) {
                    if (k.equals(LOADS)) {
                        result.put(LOADS, true);
                    } else if (k.equals(SUBSTITUTIONS)) {
                        result.put(SUBSTITUTIONS, true);
                    } else {
                        System.err.println("config.trace property contains unknown trace topic '"
                                + k + "'");
                    }
                }
                return result;
            }
        }

        private static final Map<String, Boolean> diagnostics = loadDiagnostics();

        private static final boolean traceLoadsEnabled = diagnostics.get(LOADS);
        private static final boolean traceSubstitutionsEnabled = diagnostics.get(SUBSTITUTIONS);

        static boolean traceLoadsEnabled() {
            return traceLoadsEnabled;
        }

        static boolean traceSubstitutionsEnabled() {
            return traceSubstitutionsEnabled;
        }
    }

    public static boolean traceLoadsEnabled() {
        try {
            return DebugHolder.traceLoadsEnabled();
        } catch (ExceptionInInitializerError e) {
            throw ConfigImplUtil.extractInitializerError(e);
        }
    }

    public static boolean traceSubstitutionsEnabled() {
        try {
            return DebugHolder.traceSubstitutionsEnabled();
        } catch (ExceptionInInitializerError e) {
            throw ConfigImplUtil.extractInitializerError(e);
        }
    }

    public static void trace(String message) {
        System.err.println(message);
    }

    public static void trace(int indentLevel, String message) {
        while (indentLevel > 0) {
            System.err.print("  ");
            indentLevel -= 1;
        }
        System.err.println(message);
    }

    // the basic idea here is to add the "what" and have a canonical
    // toplevel error message. the "original" exception may however have extra
    // detail about what happened. call this if you have a better "what" than
    // further down on the stack.
    static com.gu.typesafe.config.ConfigException.NotResolved improveNotResolved(Path what,
                                                                                 com.gu.typesafe.config.ConfigException.NotResolved original) {
        String newMessage = what.render()
                + " has not been resolved, you need to call Config#resolve(),"
                + " see API docs for Config#resolve()";
        if (newMessage.equals(original.getMessage()))
            return original;
        else
            return new ConfigException.NotResolved(newMessage, original);
    }

    public static com.gu.typesafe.config.ConfigOrigin newSimpleOrigin(String description) {
        if (description == null) {
            return defaultValueOrigin;
        } else {
            return SimpleConfigOrigin.newSimple(description);
        }
    }

    public static com.gu.typesafe.config.ConfigOrigin newFileOrigin(String filename) {
        return SimpleConfigOrigin.newFile(filename);
    }

    public static ConfigOrigin newURLOrigin(URL url) {
        return SimpleConfigOrigin.newURL(url);
    }
}
