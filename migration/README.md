## Elastic1 to Elastic6 migration

One off migration from elastic 1.7 to elastic 6.5 index.
Scrolls through the 1.7 images index and bulk indexes the documents into the new 6.5 index.

```
sbt migration/assembly
```

Creates a jar at:
```
migration/target/scala-2.12/migration-assembly-0.1.jar  
```

Execute
```
java -jar migration-assembly-0.1.jar [es1host] [es1port] [es1cluster] [es1index] [es6host] [es6port] [es6cluster] [es6index]
```
