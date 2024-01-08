//***permissions constants***

//-chip query content-
const CHARGEABLE_QUERY = " category:chargeable";

//-permissions options-
const CHARGEABLE_OPT = "chargeable";
const ALL_PERMISSIONS_OPT = "allPermissions";

//-permissions labels-
const CHARGEABLE_LABEL = "Chargeable";
const ALL_PERMISSIONS_LABEL = "All Permissions";

export type PermissionOption = {
  id: string,
  label: string,
  mapping: string,
  payable: string
}

export function permissionsDefaultOpt():string{
  if (window._clientConfig.permissionsDefault) {
    return window._clientConfig.permissionsDefault;
  } else {
    return ALL_PERMISSIONS_OPT;
  }
}

export function permissionsQueries():string[]  {
  if (window._clientConfig.permissionsOptions) {
    let pOpts: Array<PermissionOption> = JSON.parse(window._clientConfig.permissionsOptions);
    return pOpts.map(c => c.mapping);
  } else {
      return [
          CHARGEABLE_QUERY
      ];
  }
}

export function permissionsPayable():{opt:string, payable:string}[] {
  if (window._clientConfig.permissionsOptions) {
    let pOpts: Array<PermissionOption> = JSON.parse(window._clientConfig.permissionsOptions);
    return pOpts.map(c => { return {opt: c.id, payable: c.payable};});
  } else {
    const pPayable: { opt: string, payable: string }[] = [
      {opt: CHARGEABLE_OPT, payable: 'none'},
      {opt: ALL_PERMISSIONS_OPT, payable: 'none'}
    ];
    return pPayable;
  }
}

//-options and labels-
export function permissionsOptions():{label:string, value:string}[] {
   if (window._clientConfig.permissionsOptions) {
     let pOpts: Array<PermissionOption> = JSON.parse(window._clientConfig.permissionsOptions);
     return pOpts.map(c => {
       return {
         label: c.label,
         value: c.id
       };
     });
   } else {
     const permOpts: { label: string, value: string }[] = [
       {label: ALL_PERMISSIONS_LABEL, value: ALL_PERMISSIONS_OPT},
       {label: CHARGEABLE_LABEL, value: CHARGEABLE_OPT}
     ];
     return permOpts;
   }
}

export function permissionsMappings():{opt:string, query:string[]}[] {
  if (window._clientConfig.permissionsOptions) {
    let pOpts: Array<PermissionOption> = JSON.parse(window._clientConfig.permissionsOptions);
    return pOpts.map(c => {
      return  {
        opt: c.id,
        query: c.mapping.split(",").map(q => " " + q).filter(q => q.trim() != "")
      };
    });
  } else {
    const permMappings: { opt: string, query: string[] }[] = [
      {opt: CHARGEABLE_OPT, query: [CHARGEABLE_QUERY]},
      {opt: ALL_PERMISSIONS_OPT, query: []}
    ];
    return permMappings;
  }
}

