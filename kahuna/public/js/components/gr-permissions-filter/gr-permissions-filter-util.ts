import * as PermissionsConf from "./gr-permissions-filter-config";
import {PermissionsDropdownOption} from "./gr-permissions-filter";

//-update chips based on permissions filter-
export function updateFilterChips(permissionsSel: PermissionsDropdownOption, query: string) : string {
  let workingQuery = ' ' + (query ? query : '');
  PermissionsConf.permissionsQueries().forEach((pfQ) => {
    workingQuery = workingQuery.replace(pfQ, '');
  });
  const permMappings = PermissionsConf.permissionsMappings().filter((opt) => permissionsSel.value == opt.opt)[0];
  permMappings.query.forEach((q) => {
    workingQuery = workingQuery + q;
  });
  if (workingQuery[0] == ' ') { workingQuery = workingQuery.trimStart(); }
  return workingQuery;
}
