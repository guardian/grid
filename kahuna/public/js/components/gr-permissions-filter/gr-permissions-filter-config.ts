//***permissions constants***

//-chip query content-
const CHARGEABLE_QUERY:string = " category:chargeable";

//-permissions options-
const CHARGEABLE_OPT:string = "chargeable";
const ALL_PERMISSIONS_OPT:string = "allPermissions";

//-permissions labels-
const CHARGEABLE_LABEL:string = "Chargeable";
const ALL_PERMISSIONS_LABEL:string = "All Permissions";

export function PermissionsDefaultOpt():string{
  if(window._clientConfig.permissionsDefault) {
    return window._clientConfig.permissionsDefault;
  } else {
    return ALL_PERMISSIONS_OPT;
  }
}

export function PermissionsQueries():string[]  {
  if(window._clientConfig.permissionsQueries) {
    return window._clientConfig.permissionsQueries.split(",").map(chip => ' ' + chip);
  } else {
      return [
          CHARGEABLE_QUERY
      ];
  }
}

export function PermissionsOptValues(): string[] {
  if(window._clientConfig.permissionsOptions) {
    return window._clientConfig.permissionsOptions.split(",");
  } else {
    const optVals = [
      ALL_PERMISSIONS_OPT,
      CHARGEABLE_OPT
    ];
    return optVals;
  }
}

//-options and labels-
export function PermissionsOptions():{label:string, value:string}[] {
   if(window._clientConfig.permissionsOptions && window._clientConfig.permissionsLabels) {
     let dropDownOpts: {label:string, value:string}[] = [];
     for(let i=0; i < window._clientConfig.permissionsOptions.split(",").length; i++ ) {
       let opt = {
         label: window._clientConfig.permissionsLabels.split(",")[i],
         value: window._clientConfig.permissionsOptions.split(",")[i]
       };
       dropDownOpts.push(opt);
     }
     return dropDownOpts;
   } else {
     const permOpts: { label: string, value: string }[] = [
       {label: ALL_PERMISSIONS_LABEL, value: ALL_PERMISSIONS_OPT},
       {label: CHARGEABLE_LABEL, value: CHARGEABLE_OPT},
     ];
     return permOpts;
   }
}

export function PermissionsMappings():{opt:string, query:string[]}[] {
  if(window._clientConfig.permissionsOptions && window._clientConfig.permissionsMappings) {
    let mappings: {opt:string, query:string[]}[] = [];
    let popts = window._clientConfig.permissionsOptions.split(",");
    let pmaps = window._clientConfig.permissionsMappings.split(",");
    for(let i=0; i < popts.length; i++ ) {
      let qArr: string[] = pmaps[i].split("#").map(q => " " + q).filter(q => q.trim() != "");
      let query = {
        opt: popts[i],
        query: qArr
      };
      mappings.push(query);
    }
    return mappings;
  } else {
    const permMappings: { opt: string, query: string[] }[] = [
      {opt: CHARGEABLE_OPT, query: [CHARGEABLE_QUERY]},
      {opt: ALL_PERMISSIONS_OPT, query: []}
    ]
    return permMappings;
  }
}

