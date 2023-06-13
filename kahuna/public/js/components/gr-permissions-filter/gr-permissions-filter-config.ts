//-permissions constants-
export const CHARGEABLE_QUERY:string = " category:chargeable";
export const NOT_CHARGEABLE_QUERY:string = "-category:chargeable";
export const CHARGEABLE_OPT:string = "chargeable";
export const PROGRAM_QUERY:string = " category:program-promotional";
export const NOT_PROGRAM_QUERY:string = "-category:program-promotional";
export const PROGRAM_OPT:string =  "program";
export const BBC_OWNED_QUERY:string = " is:BBC-owned";
export const NOT_HAS_RESTRICTIONS_QUERY:string = "-has:restrictions";
export const USABLE_FOR_ALL_OPT:string = "usableForAll";
export const FREE_FOR_NEWS_OPT:string = "freeForNews";
export const ALL_PERMISSIONS_OPT:string = "allPermissions";

//-options-
export const PermissionsOptions:{label:string, value:string}[] = new Array(
  {label:"All Permissions", value:"allPermissions"},
  {label:"Usable for all", value:"usableForAll"},
  {label:"Free for News", value:"freeForNews"},
  {label:"Chargeable", value:"chargeable"},
  {label:"For promoting a programme", value:"program"}
);

