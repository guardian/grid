# media-api

## Image search

    GET /images

### Optional query string parameters

| Key        | Description                               | Default          |
|------------|-------------------------------------------|------------------|
| q          | Text search query                         | [empty]
| offset     | Start offset for results                  | 0
| length     | Maximum number of results                 | 10
| orderBy    | Field for ordering (prepend '-' for DESC) | -uploadTime
| since      | Search images uploaded since this time    | [no lower bound]
| until      | Search images uploaded before this time   | [no upper bound]

Date-time bounds (`since`/`until`, `takenSince`/`takenUntil`, and `modifiedSince`/`modifiedUntil`)
accept ISO timestamps with seconds and a timezone, with optional milliseconds, e.g.
`2013-10-24T11:09:38Z` or `2013-10-24T12:09:38.123+01:00`. Encode a literal `+` as `%2B`
in a URL. Date-only values such as `2013-10-24` mean midnight UTC. Either bound can be omitted;
provided bounds are exclusive. Relative durations such as `7.days` or `2.hours` are also accepted
and are evaluated against the current time on each request. Invalid bounds are currently ignored.

### Date comparison chips in `q`

Comparison chips accept the same timestamp and duration syntax, while preserving existing date-only
and human-date parsing:

| Date | Lower-bound chip | Upper-bound chip |
|------|------------------|------------------|
| Uploaded | `>date:…` or `>uploaded:…` | `<date:…` or `<uploaded:…` |
| Taken | `>taken:…` | `<taken:…` |
| Usage added | `usages@>added:…` | `usages@<added:…` |

For example:

```text
usages@>added:"2026-10-10T14:30:00Z" usages@<added:"2026-10-10T17:00:00.123Z"
>taken:"2026-10-10T15:30:00+01:00"
usages@>added:2.hours
```

The dot in `2.hours` is literal duration notation, typed by the user. The date picker does not
produce it: picker presets produce absolute timestamps. Duration chip cutoffs are recalculated
on each request, including later pagination requests. Prefix a comparison chip with `-` to negate it.

Unlike the top-level bounds, comparison chips include equality (`gte`/`lte`: greater/less than
or equal). Their existing opposite bounds remain: `>` ends at tomorrow's midnight in the backend's
default timezone; `<` starts at the Unix epoch. Existing date-only chip values retain their
backend-local interpretation; explicit timestamps identify instants independently of that timezone.

Whole-period expressions such as `date:2026-10-10`, `taken:today` and `@2026-10-10` are unchanged;
they do not gain timestamp or duration parsing. No last-modified comparison alias is added.

### Example

…/images?q=horse&since=2.weeks

See the [routes file](https://github.com/guardian/media-service/blob/master/media-api/conf/routes) for more API
"documentation".
