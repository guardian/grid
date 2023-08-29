//***permissions constants***

//-chip query content-
const CHARGEABLE_QUERY:string = " category:chargeable";
const NOT_CHARGEABLE_QUERY:string = " -category:chargeable";
const PROGRAM_QUERY:string = " category:program-promotional";
const NOT_PROGRAM_QUERY:string = " -category:program-promotional";
const BBC_OWNED_QUERY:string = " is:BBC-owned";
const NOT_HAS_RESTRICTIONS_QUERY:string = " -has:restrictions";

//-permissions options-
const CHARGEABLE_OPT:string = "chargeable";
const PROGRAM_OPT:string =  "program";
const USABLE_FOR_ALL_OPT:string = "usableForAll";
const FREE_FOR_NEWS_OPT:string = "freeForNews";
const ALL_PERMISSIONS_OPT:string = "allPermissions";

//-permissions labels-
const CHARGEABLE_LABEL:string = "Chargeable";
const PROGRAM_LABEL:string = "For promoting a programme";
const FREE_FOR_NEWS_LABEL:string = "Free for News";
const USABLE_FOR_ALL_LABEL:string = "Usable for All";
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
          CHARGEABLE_QUERY,
          NOT_CHARGEABLE_QUERY,
          PROGRAM_QUERY,
          NOT_PROGRAM_QUERY,
          BBC_OWNED_QUERY,
          NOT_HAS_RESTRICTIONS_QUERY
      ];
  }
}

export function PermissionsOptValues(): string[] {
  if(window._clientConfig.permissionsOptions) {
    return window._clientConfig.permissionsOptions.split(",");
  } else {
    const optVals = [
      CHARGEABLE_OPT,
      PROGRAM_OPT,
      USABLE_FOR_ALL_OPT,
      FREE_FOR_NEWS_OPT,
      ALL_PERMISSIONS_OPT
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
       {label: USABLE_FOR_ALL_LABEL, value: USABLE_FOR_ALL_OPT},
       {label: FREE_FOR_NEWS_LABEL, value: FREE_FOR_NEWS_OPT},
       {label: CHARGEABLE_LABEL, value: CHARGEABLE_OPT},
       {label: PROGRAM_LABEL, value: PROGRAM_OPT}
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
      {opt: USABLE_FOR_ALL_OPT, query: [BBC_OWNED_QUERY, NOT_HAS_RESTRICTIONS_QUERY]},
      {opt: FREE_FOR_NEWS_OPT, query: [NOT_CHARGEABLE_QUERY, NOT_PROGRAM_QUERY]},
      {opt: CHARGEABLE_OPT, query: [CHARGEABLE_QUERY]},
      {opt: PROGRAM_OPT, query: [PROGRAM_QUERY]},
      {opt: ALL_PERMISSIONS_OPT, query: []}
    ]
    return permMappings;
  }
}

