# Grid behaviour: Getty pay-collection image when supplier is over quota

**Date:** 10 May 2026  
**Method:** Source archaeology only — no live infra calls.  
**Scope:** `media-api/`, `common-lib/`, `kahuna/public/js/`

---

## Scenario

A Guardian user with default editorial permissions (`EditMetadata`) views an image where:

- `usageRights.category = "agency"`
- `usageRights.supplier = "Getty Images"`
- `usageRights.suppliersCollection` ∈ `suppliersCollectionExcl["Getty Images"]`
  (i.e. one of the configured pay-collections — "Premium Collection", etc.)
- Getty Images is **currently over quota** in `UsageStore`
- No active allow-use or deny-use lease
- No `restrictions` string
- Credit and description both present

---

## Q1 — `cost` field

**Result: `"pay"`. Quota is never consulted when the collection is in `suppliersCollectionExcl`.**

`CostCalculator.getCost` evaluates three `Option[Cost]` slots in order, taking the first `Some`:

```scala
// media-api/app/lib/usagerights/CostCalculator.scala:37-48
val restricted: Option[Cost] = usageRights.restrictions.map(r => Conditional)  // None
val categoryCost: Option[Cost] = usageRights.defaultCost                        // Agency.defaultCost = None
val supplierCost: Option[Cost] = usageRights match {
  case u: Agency => getAgencyCost(u)   // evaluated
  case _ => None
}
restricted.orElse(categoryCost).orElse(supplierCost).getOrElse(defaultCost)
```

Inside `getAgencyCost`:

```scala
// media-api/app/lib/usagerights/CostCalculator.scala:12-26
val isFreeFromAgency = isFreeSupplier(supplier)   // true: "Getty Images" is in freeSuppliers
                    && !agencyUsageRights.suppliersCollection.exists(isExcludedColl(supplier, _))
                    // isExcludedColl("Getty Images", "<pay-collection>") = true
                    // => !true = false  =>  isFreeFromAgency = false
if (isFreeFromAgency) { ... }   // branch NOT taken
else { None }                   // returns None
```

`Agency.defaultCost = None` (`common-lib/.../UsageRights.scala:221`). All three slots are `None`, so `getOrElse(defaultCost)` fires with `defaultCost = Pay` (`CostCalculator.scala:6`).

Quota is only consulted inside the `if (isFreeFromAgency)` branch, which is never reached for an excluded collection. This is explicitly tested:

```scala
// media-api/test/usagerights/CostCalculatorTest.scala:72-76
it("Pay should trump Overquota with a free supplier whose gone over quota, but excluded collection") {
  val usageRights = Agency("Getty Images", Some("Bob Thomas Sports Photography"))
  val cost = OverQuotaCosting.getCost(usageRights)
  cost should be (Pay)
}
```

---

## Q2 — `valid` field

**With `EditMetadata` permission: `valid = true` (overridden). Without: `valid = false`.**

`validityMap` is built by `ImageExtras.validationMap` (`ImageExtras.scala:48-68`). The override flag:

```scala
val shouldOverride = validityOverrides(image, withWritePermission).exists(_._2 == true)
// = ("current_allow_lease" -> false, "has_write_permission" -> withWritePermission).exists(...)
// With EditMetadata permission: shouldOverride = true
```

Each check's `isValid = !invalid || (overrideable && shouldOverride)`:

| key | `invalid` | `overrideable` | `isValid` (write=true) | `isValid` (write=false) |
|---|---|---|---|---|
| `paid_image` | true (`isPay` → true) | true | **true** (overridden) | **false** |
| `over_quota` | true (quota exceeded) | true | **true** (overridden) | **false** |
| `conditional_paid` | false | true | true | true |
| `no_rights` | false (has rights) | true | true | true |
| `current_deny_lease` | false | true | true | true |
| `tass_agency_image` | false | true | true | true |
| `missing_credit` | false (credit present) | false | true | true |
| `missing_description` | false (desc present) | false | true | true |

`isValid(validityMap) = validityMap.values.forall(_.isValid)`. With write permission → **`valid: true`**. Without → **`valid: false`**.

---

## Q3 — `invalidReasons` field

**Both `"paid_image"` and `"over_quota"` appear — even though the image is already `Pay`.**

`invalidReasons` filters on the raw `.invalid` field, not on `.isValid`:

```scala
// media-api/app/lib/ImageExtras.scala:82-88
def invalidReasons(validityMap: ValidMap, ...) = validityMap
  .filter { case (_, v) => v.invalid }   // raw .invalid, not .isValid
  .map { case (id, _) => id -> ... }
```

The `"over_quota"` check calls `quotas.isOverQuota(image.usageRights)` **unconditionally** (`ImageExtras.scala:58`) — it does not gate on `cost`, collection, or whether the image is already `Pay`. The quota check is purely per-supplier (looks up `"Getty Images"` in the usage store).

**`invalidReasons` emitted:**
```json
{
  "paid_image": "Paid imagery requires a lease",
  "over_quota":  "The quota for this supplier has been exceeded"
}
```

---

## Q4 — Badge colour

**Red (£ icon, `cost--pay` CSS class) — identical whether or not the supplier is over quota.**

`addUsageCost` serialises `cost = Pay` as the string `"pay"` (`ImageResponse.scala:201-215`). In `image.js`, `flagState = states.costState = (hasRights ? cost : "no_rights") = "pay"` (`image/service.js:33`). The template:

```html
<!-- kahuna/public/js/preview/image.html:167-172 -->
<div ng-switch-when="pay"
     class="cost bottom-bar__action ..."
     ng-class="{'cost--pay': !ctrl.hasActiveAllowLease, 'cost--leased': ctrl.hasActiveAllowLease}"
     title="Pay to use">
    <span>£</span>
</div>
```

No allow lease → class = `cost--pay`. CSS:

```css
/* kahuna/public/stylesheets/main.css:1354-1358 */
.cost--pay,
.cost--no_rights,
.cost--overquota {
    background-color: red;
}
```

| Scenario | `cost` field | `flagState` | Badge |
|---|---|---|---|
| Pay-collection, not over quota | `"pay"` | `"pay"` | Red (£ icon) |
| Pay-collection, over quota | `"pay"` | `"pay"` | Red (£ icon) — **identical** |
| Free Getty image, over quota | `"overquota"` | `"overquota"` | Red (trending_up icon) |

The `"overquota"` switch branch in the template is only reached when `cost === "overquota"`, which only happens for free-collection Getty images. For pay-by-collection images the quota branch in `getAgencyCost` is never entered, so `cost` is `"pay"` unconditionally.

---

## Q5 — Validity messages in the detail panel

**Kahuna renders ALL `invalidReasons` entries — no filtering or "strongest" selection.**

```html
<!-- kahuna/public/js/components/gr-metadata-validity/gr-metadata-validity.html:18-21 -->
<ul ng-if="!ctrl.isDeleted">
    <li ng-repeat="(key, reason) in ctrl.invalidReasons">
        {{reason}}
    </li>
</ul>
```

The controller sets `ctrl.invalidReasons = image.data.invalidReasons` verbatim (`gr-metadata-validity.js:22`).

`isStrongWarning` (`gr-metadata-validity.js:30`):

```js
ctrl.isStrongWarning = ctrl.isDeleted || !ctrl.isOverridden || image.data.cost === "pay";
// cost === "pay" → true always for this scenario → red background regardless
```

`isOverridden = showInvalidReasons && image.data.valid`. With `EditMetadata` permission and `valid = true`, `isOverridden = true` → header text uses `warningTextHeader` ("Warning:…") rather than `unusableTextHeader` ("This image cannot be used…").

**Text rendered (user has `EditMetadata`, image is over quota):**
- Background: red (`validity--invalid`)
- Header: `warningTextHeader` (configurable — typically "Warning")
- List item 1: "Paid imagery requires a lease"
- List item 2: "The quota for this supplier has been exceeded"

**Text rendered (user has `EditMetadata`, image is NOT over quota):**
- Background: red
- Header: `warningTextHeader`
- List item 1: "Paid imagery requires a lease"
- *(no `over_quota` entry)*

---

## Q6 — Permission gating

**`withWritePermission` is the only permission that affects cost/validity display.** It is resolved as:

```scala
// media-api/app/controllers/MediaApi.scala:549
val writePermission = authorisation.isUploaderOrHasPermission(
  request.user, image.instance.uploadedBy, EditMetadata)
```

A default editorial user with `EditMetadata` → `withWritePermission = true`.

Effects:
- `shouldOverride = true` → `valid: true` in JSON → panel header switches to "Warning" variant
- `invalidReasons` map **unchanged** — both entries still emitted
- Badge colour and icon **unchanged** — driven by `cost`, not `valid`

`DeleteImage`, `DeleteCropsOrUsages`, `UploadImages` affect action button availability only — no effect on cost, validity, or badge.

---

## Surprises

### `over_quota` leaks into `invalidReasons` even when `cost = Pay`

`CostCalculator.getCost` and `ImageExtras.validationMap`'s `"over_quota"` entry are computed by **completely independent code paths**:

- `getCost` short-circuits for excluded collections: `isFreeFromAgency = false` → quota never consulted → cost = `Pay`.
- `validationMap` calls `quotas.isOverQuota(image.usageRights)` **unconditionally** (`ImageExtras.scala:58`) — no gate on cost, collection, or whether the image is already `Pay`.

The result: a Getty Premium Collection image whose supplier is over quota emits both `"paid_image"` and `"over_quota"` in `invalidReasons`. A reader seeing both might infer the image's cost is `Overquota`, but the `cost` field is `"pay"`. The two signals are conceptually redundant (the image is unusable without a lease regardless of quota state), but both fire because they live in separate systems with no cross-dependency.

Grid outputs both, Kahuna renders both, and the badge is red either way.
