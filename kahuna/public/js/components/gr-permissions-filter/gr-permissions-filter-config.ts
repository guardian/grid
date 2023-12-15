//***permissions constants***

//-chip query content-
const CHARGEABLE_QUERY = " category:chargeable";

//-permissions options-
const CHARGEABLE_OPT = "chargeable";
const ALL_PERMISSIONS_OPT = "allPermissions";

//-permissions labels-
const CHARGEABLE_LABEL = "Chargeable";
const ALL_PERMISSIONS_LABEL = "All Permissions";

export function permissionsDefaultOpt():string{
  if (window._clientConfig.permissionsDefault) {
    return window._clientConfig.permissionsDefault;
  } else {
    return ALL_PERMISSIONS_OPT;
  }
}

export function permissionsQueries():string[]  {
  if (window._clientConfig.permissionsMappings) {
    return window._clientConfig.permissionsMappings.split(",").flatMap(chips => chips.split("#"));
  } else {
      return [
          CHARGEABLE_QUERY
      ];
  }
}

export function permissionsPayable():{opt:string, payable:string}[] {
  if (window._clientConfig.permissionsOptions && window._clientConfig.permissionsPayable) {
    const mappings: {opt:string, payable:string}[] = [];
    const pOpts = window._clientConfig.permissionsOptions.split(",");
    const pPay = window._clientConfig.permissionsPayable.split(",");
    for (let i = 0; i < pOpts.length; i++ ) {
      const p: string = pPay[i];
      const pOpt = {
        opt: pOpts[i],
        payable: p
      };
      mappings.push(pOpt);
    }
    return mappings;
  } else {
    const pPayable: { opt: string, payable: string }[] = [
      {opt: CHARGEABLE_OPT, payable: 'none'},
      {opt: ALL_PERMISSIONS_OPT, payable: 'none'}
    ];
    return pPayable;
  }
}

export function permissionsOptValues(): string[] {
  if (window._clientConfig.permissionsOptions) {
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
export function permissionsOptions():{label:string, value:string}[] {
   if (window._clientConfig.permissionsOptions && window._clientConfig.permissionsLabels) {
     const dropDownOpts: {label:string, value:string}[] = [];
     for (let i = 0; i < window._clientConfig.permissionsOptions.split(",").length; i++ ) {
       const opt = {
         label: window._clientConfig.permissionsLabels.split(",")[i],
         value: window._clientConfig.permissionsOptions.split(",")[i]
       };
       dropDownOpts.push(opt);
     }
     return dropDownOpts;
   } else {
     const permOpts: { label: string, value: string }[] = [
       {label: ALL_PERMISSIONS_LABEL, value: ALL_PERMISSIONS_OPT},
       {label: CHARGEABLE_LABEL, value: CHARGEABLE_OPT}
     ];
     return permOpts;
   }
}

export function permissionsMappings():{opt:string, query:string[]}[] {
  if (window._clientConfig.permissionsOptions && window._clientConfig.permissionsMappings) {
    const mappings: {opt:string, query:string[]}[] = [];
    const popts = window._clientConfig.permissionsOptions.split(",");
    const pmaps = window._clientConfig.permissionsMappings.split(",");
    for (let i = 0; i < popts.length; i++ ) {
      const qArr: string[] = pmaps[i].split("#").map(q => " " + q).filter(q => q.trim() != "");
      const query = {
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
    ];
    return permMappings;
  }
}

