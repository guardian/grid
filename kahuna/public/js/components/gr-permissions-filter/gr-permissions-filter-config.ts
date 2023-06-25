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

export function PermissionsDefaultOpt():string {
  return ALL_PERMISSIONS_OPT;
}

export function PermissionsQueries():string[]  {
  //-these can ultimately be derived from config file-
  // e.g. window._clientConfig.permissionsQueries;

  const queries = [
    CHARGEABLE_QUERY,
    NOT_CHARGEABLE_QUERY,
    PROGRAM_QUERY,
    NOT_PROGRAM_QUERY,
    BBC_OWNED_QUERY,
    NOT_HAS_RESTRICTIONS_QUERY
  ];
  return queries;
}

export function PermissionsOptValues(): string[] {
  //-will be read in from config in due course
  const optVals = [
    CHARGEABLE_OPT,
    PROGRAM_OPT,
    USABLE_FOR_ALL_OPT,
    FREE_FOR_NEWS_OPT,
    ALL_PERMISSIONS_OPT
  ];
  return optVals;
}

//-options-
export function PermissionsOptions():{label:string, value:string}[] {
   //--will be established from config?--
   const permOpts:{label:string, value:string}[] = [
    {label:ALL_PERMISSIONS_LABEL, value:ALL_PERMISSIONS_OPT},
    {label:USABLE_FOR_ALL_LABEL, value:USABLE_FOR_ALL_OPT},
    {label:FREE_FOR_NEWS_LABEL, value:FREE_FOR_NEWS_OPT},
    {label:CHARGEABLE_LABEL, value:CHARGEABLE_OPT},
    {label:PROGRAM_LABEL, value:PROGRAM_OPT}
   ];
   return permOpts;
};

export function PermissionsMappings():{opt:string, queries:string[]}[] {
  const permMappings:{opt:string, queries:string[]}[] = [
    {opt:USABLE_FOR_ALL_OPT, queries:[BBC_OWNED_QUERY, NOT_HAS_RESTRICTIONS_QUERY]},
    {opt:FREE_FOR_NEWS_OPT, queries:[NOT_CHARGEABLE_QUERY, NOT_PROGRAM_QUERY]},
    {opt:CHARGEABLE_OPT, queries:[CHARGEABLE_QUERY]},
    {opt:PROGRAM_OPT, queries:[PROGRAM_QUERY]},
    {opt:ALL_PERMISSIONS_OPT, queries:[]}
  ]
  return permMappings;
}

