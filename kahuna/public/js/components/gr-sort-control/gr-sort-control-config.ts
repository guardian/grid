import {SortDropdownOption} from "./gr-sort-control";

export function manageSortSelection(newSelection:string): string {
  let newVal;
  switch (newSelection) {
    case "newest":
      newVal = "newest";
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
      newVal = "newest";
      break;
  }
  return newVal;
}

export const SortOptions: SortDropdownOption[] = [
  {
    value: "newest",
    label: "Upload date (new to old)",
    isCollection: false,
    isTaken: false
  },
  {
    value: "oldest",
    label: "Upload date (old to new)",
    isCollection: false,
    isTaken: false
  },
  {
    value: "-taken",
    label: "Taken date (new to old)",
    isCollection: false,
    isTaken: true
  },
  {
    value: "taken",
    label: "Taken date (old to new)",
    isCollection: false,
    isTaken: true
  },
  {
    value: "dateAddedToCollection",
    label: "Added to collection (new to old)",
    isCollection: true,
    isTaken: false
  }
];

export const DefaultSortOption: SortDropdownOption = SortOptions[0];
export const CollectionSortOption: SortDropdownOption = SortOptions[4];
export const HAS_DATE_TAKEN = "has:dateTaken";
export const HASNT_DATE_TAKEN = "-has:dateTaken";
export const TAKEN_SORT = "taken";
export const COLLECTION_SORT_VALUE = SortOptions[4].value;
