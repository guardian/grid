# Collections

Collections are a way of organising images in Grid. Collections have a hierarchy similar to:

```
ROOT COLLECTION 1
  ⎿ Collection A
    ⎿ Collection B
       ⎿ ...
ROOT COLLECTION 2
  ⎿ Collection C
    ⎿ Collection D
       ⎿ ...
```

## Root collections
Currently, root collections can only be created via the API. That is, Kahuna doesn't have a UI for it.

We can use [create-root-collection.sh](../../dev/script/create-root-collection.sh) to create a root collection:

```shell script
./dev/script/create-root-collection.sh COLLECTION_NAME
```
