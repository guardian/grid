import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { ChangeEvent, useMemo } from "react";
import { getFeatureSwitchActive } from "../gr-feature-switch-panel/gr-feature-switch-panel";

type Tenant = {
  id: string;
  name: string;
};

type GrTenantSwitcherProps = {
  tenantOptions: Tenant[];
  tenancy: any; // TODO improve!
  $state: any;
}
const GrTenantSwitcher: React.FC<GrTenantSwitcherProps> = ({
  tenantOptions,
  tenancy,
  $state
}) => {
  if (!getFeatureSwitchActive('multitenancy') || !tenantOptions.length) {
    // tenancy.clear();
    return null;
  }
  const onSelectTenant = (ev: ChangeEvent<HTMLSelectElement>) => {
    const id = (ev.target as any).value as string;

    if (id === '_default') {
      tenancy.clear();
    } else {
      tenancy.set(id);
    }

    $state.reload();
  };

  const pickedTenant = useMemo(() => tenancy.get() || '_default', []);

  return (
    <select name="tenants" value={pickedTenant} onChange={onSelectTenant}>
      <option value="_default">Default</option>
      {tenantOptions.map(op => (
        <option value={op.id} key={op.id}>
          {op.name}
        </option>
      ))}
    </select>
  );
};

export const grTenantSwitcher = angular.module('gr.tenantSwitcher', [])
  .component('grTenantSwitcher', react2angular(GrTenantSwitcher, ['tenantOptions'], ['tenancy', '$state']));
