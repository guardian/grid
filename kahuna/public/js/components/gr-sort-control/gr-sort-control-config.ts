import {SortDropdownOption} from "./gr-sort-control";

export function manageSortSelection(newSelection:string): string {
  let newVal;
  switch (newSelection) {
    case "uploadNewOld":
      newVal = undefined;
      break;
    case "oldest":
      newVal = "oldest";
      break;
    case "-taken":
      newVal = "-taken";
      break;
    case "taken":
      newVal = "taken";
      break;
    case "dateAddedToCollection":
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
    label: "Upload date (new to old)",
    isCollection: false
  },
  {
    value: "oldest",
    label: "Upload date (old to new)",
    isCollection: false
  },
  {
    value: "-taken",
    label: "Taken date (new to old)",
    isCollection: false
  },
  {
    value: "taken",
    label: "Taken date (old to new)",
    isCollection: false
  },
  {
    value: "dateAddedToCollection",
    label: "Added to collection (new to old)",
    isCollection: true
  }
];

export const DefaultSortOption: SortDropdownOption = SortOptions[0];
export const CollectionSortOption: SortDropdownOption = SortOptions[4];
