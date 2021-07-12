# Welcome - thanks for contributing to the Grid image management system

We follow the standard GitHub [fork & pull](https://help.github.com/articles/using-pull-requests/#fork--pull) approach to pull requests. i.e. Fork upstream, develop in a branch, and submit a PR.

If you're not sure how to approach a contribution you want to make then feel free to open an issue instead and we'd be glad to discuss it with you.

## Project Structure

The project is comprised of multiple micro services, each of which is dependent on its own library,
plus either `common-lib` or one or both of `rest-lib` and `persistence-lib`.

Each has a short readme, but they are summarised below for convenience:

### Shared libraries

 * Common Lib - Code which is common to _all_ micro services, such as the data model.
 * REST Lib - Common code for presenting a REST interface.  This library depends directly on `common-lib` and `play`.
 * Persistence Lib - Common code for querying from or writing to Elasticsearch. This library depends directly on `common-lib` and `elasticsearch`.

### Microservices

 * kahuna - front end (UI) code plus a small service to serve config to front end
 * admin-tools - lambdas for controlled bulk re-ingestion and analysis
 * auth - authorisation
 * image-loader - direct ingestion of images
 * cropper - creating new images by cropping originals
 * usage - recording usages on a per-image basis in dynamodb
 * thrall - updating ElasticSearch for purposes of image search
 * metadata-editor - handling changes to metadata
 * leases - recording leases on a per-image basis in dynamodb
 * scripts - the usual motley crew of useful script tasks
 * collections - recording collections on a per-image basis in dynamodb
 * image-counter-lambda - metrics emitting lambda
 * media-api - main api for querying and viewing images


## Contribution process

1. To avoid wasted effort it is often worth talking to the Grid devs to discuss what you are hoping to do, you never know - we might already have implemented what you need! Feel free to open an issue first and we'd be glad to figure that out with you.
1. Fork the project on GitHub.
1. Create a feature branch ready to work on your feature, for example: `git checkout -b support-for-heic-images`
1. Work on your feature. When you are doing this:
   - try to follow existing code conventions where possible
   - write tests to cover your new code, especially when the code is non-trivial or when regressions are likely to cause serious problems (e.g. where a database serialisation format change might make existing documents impossible to read)
1. Commit your code to your branch following good practice [below](#writing-commits).
1. Raise a pull request following good practice documented [below](#writing-pull-requests).
1. A build will kick off on GitHubActions to confirm that your changes build and the tests pass.
1. Someone from the Guardian will:
   - undertake an initial review to check whether the PR is following the processes, conventions and good practices listed above.
   - follow [these instructions](https://github.com/guardian/grid/wiki/Testing-third-party-contributions) to kick off an internal build that is possible to deploy to the Guardian testing environment.
   - do a more through review to ensure that the code quality is high, that the PR does what it aims to and that it is architecturally in keeping with the rest of the project; as part of this they are likely to run your branch locally themselves or on the Guardian's test environment.
   - provide feedback asking for clarifications and/or changes to be made.
      - when making changes please push new commits to the same branch
   - when happy, approve the PR
   - check with the committer that they are ready for the code to be merged
   - merge the PR!
   - ensure that your change is deployed into the Guardian's production environment (note that our [PRout](https://github.com/guardian/prout) bot currently adds a number of `Pending-on-xxx` tags when a PR is merged which are replaced with `Seen-on-xxx` tags once the service has completed deploying - this is a useful proxy to see when something has been deployed to Guardian infrastructure)
1. Consider your next contribution :)

## Writing commits

When writing a commit, think about your audience. Commits tend to be read in two contexts: when reviewing a PR for including in the code and when carrying out code archaeology to understand why something has been written in a particular way (often years after the committer has stopped working for an organisation).

A good commit message:
 - Explains why a change is being made as well as what the change is
 - Makes use of both the summary and description as necessary, don't constrain yourself to the summary line unnecessarily

There are many resources diving into this topic in detail and we recommend further reading:
 - gov.uk's [git styleguide](https://github.com/alphagov/styleguides/blob/master/git.md).
 - (How to write a Git commit message)[https://chris.beams.io/posts/git-commit/].

### A note on force pushing (tl;dr: never use git push -f)

If you are amending commits or rebasing to restructure your work then you may need to force push a branch. In this circumstance it is tempting to use `git push --force` (or `git push -f`), but this is dangerous as you could unknowingly overwrite another person's changes (both on the branch you're working on and also any other branch due to the default push behaviour of git).

Atlassian has written an excellent blog that explains why in more detail: https://developer.atlassian.com/blog/2015/04/force-with-lease/.

The safe alternative is to use `git push --force-with-lease origin support-for-heic-images` which checks that the remote branch is in the same state as the local copy of the remote branch. It also explicitly specifies the branch to push as by default all branches.

The author has an alias for this, `pushf`, which is shorter to type. You can set this up with `git config --global alias.pushf 'push --force-with-lease'`. As an example you can then use `git pushf origin support-for-heic-images`.

## Writing pull requests

This section is inspired by gov.uk's [pull request styleguide](https://github.com/alphagov/styleguides/blob/master/pull-requests.md).

### Bear in mind

- PRs should not be used for proposals or discussions about architecture - open an issue or talk to a developer before starting to write code.
- Break down larger pieces of work into smaller, single responsibility, PRs - either by breaking it down into smaller tasks or by shipping incomplete features behind a switch.

### Opening a request

- Before opening the PR, make sure you're up to date with `main` so that your changes are easier to merge (always rebase rather than merge `main` into your branch).
- The title and description should help the reviewer. Make the title succinct and descriptive, and then add detail in the description.
- The description should:
   - explain the motivation of a change
   - summarise your changes
   - include any useful links, eg to a GitHub issue, Trello card or related PRs
   - if the changes involve frontend code include a screenshot or video of how the new feature appears and behaves
   - explain any potentially contentious changes, and what testing you have done
   - if the changes require updating configuration, provide an example of the required changes to make this explicit
- Consider making your PR _**draft**_ (see https://ardalis.com/github-draft-pull-requests/). This should be used when your branch is not yet ready to merge but you would like some feedback from some specific people. The Guardian will not look at PRs that are draft unless explicitly asked to (we are happy to do so though, just let us know!)

### Responding to feedback

 - Minor changes to a PR should be done by amending the appropriate commit (see above note about force pushing).
 - Significant changes warrant their own commits, although ensure that your commit is descriptive of the change, not just `addressing feedback`.
 - Remember to comment on the PR to say when it is ready for further review.

