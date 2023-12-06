import {SortDropdownOption} from "./gr-sort-control";

export function ManageSortSelection(newSelection:string): string {
  let newVal;
  switch(newSelection){
    case "uploadNewOld":
      newVal = undefined;
      break;
    case "uploadOldNew":
      newVal = "oldest";
      break;
    case "collecAdded":
      newVal = "dateAddedToCollection";
      break;
    default:
      newVal = undefined;
      break;
  }
  return newVal;
}

export const SortOptions: SortDropdownOption[] = [
  {
    value: "uploadNewOld",
    label: "Upload date (new to old)"
  },
  {
    value: "uploadOldNew",
    label: "Upload date (old to new)"
  },
  {
    value: "collecAdded",
    label: "Added to Collection (new to old)"
  }
];

export const DefaultSortOption: SortDropdownOption = {
  value: "uploadNewOld",
  label: "Upload date (new to old)"
};
