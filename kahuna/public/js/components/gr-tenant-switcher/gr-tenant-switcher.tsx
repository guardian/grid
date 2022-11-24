import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import {ChangeEvent, useMemo} from "react";

type Tenant = {
  id: string;
  name: string;
};

type GrTenantSwitcherProps = {
  tenantOptions: Tenant[];
  tenancy: any;
  $window: angular.IWindowService;
}
const GrTenantSwitcher: React.FC<GrTenantSwitcherProps> = ({
  tenantOptions,
  tenancy,
  $window
}) => {
  const onSelectTenant = (ev: ChangeEvent<HTMLSelectElement>) => {
    const id = (ev.target as any).value as string;

    if (id === '_default') {
      tenancy.clear();
    } else {
      tenancy.set(id);
    }

    $window.location.reload();
  };

  const pickedTenant = useMemo(() => tenancy.get() || '_default', []);

  return <select name="tenants" value={pickedTenant} onChange={onSelectTenant}>
    <option value="_default">Default</option>
    {tenantOptions.map(op => (
      <option value={op.id} key={op.id}>
        {op.name}
      </option>
    ))}
  </select>;
};

export const grTenantSwitcher = angular.module('gr.tenantSwitcher', [])
  .component('grTenantSwitcher', react2angular(GrTenantSwitcher, ['tenantOptions'], ['tenancy', '$window']));
