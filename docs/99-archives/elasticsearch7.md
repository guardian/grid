# Migration to Elasticsearch 7

The Grid uses Elasticsearch to persist and search image metadata.

After the missing images debacle of 2020, it was decided that an upgrade would be a safe option.

# Planned Process

We have upgraded to ES 6.8.0 and will upgrade to 7.5.2 next.

# Implementation

The upgrade-in-situ process for the DB has been tested and is seamless.
See editorial-tools-platform for cloudformation changes, and amigo for the new
grid-elasticsearch-7 recipe.

The client changes are slightly more ... interesting.

We must upgrade Elastic4S, but the library has been refactored and more changes
are required than simply upversioning.

The majority of changes are package name changes, but some changes to functionality
(eg removing mappings) has been required.
