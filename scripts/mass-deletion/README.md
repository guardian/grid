# mass-deletion

The Grid services and UI have no way to perform mass deletion of images. When
this is required, you will need to perform it by interacting with the Grid API.
This script may help you to run these deletions.

## input

### todelete.txt

File containing list of image IDs to be deleted, separated by newlines

e.g.
```
abcdef0123456789abcdef0123456789abcdef01
10fedcba9876543210fedcba9876543210fedcba
...
```

### GRIDKEY

Environment variable containing [Grid API key](/docs/03-apis/01-authentication.md#api-keys)
to use for the request (should be Internal tier)

### GRIDDOMAIN

Environment variable containing the grid domain (kahuna domain).

## output

### progress.txt

File contains the last processed Image ID - this allows cancelling and resuming
the script if necessary.

### complete.txt

File containing the list of successfully deleted Image IDs.

### errors.txt

File containing the list of Image IDs which could not be deleted (for any
reason).
