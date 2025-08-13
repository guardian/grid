import {SortDropdownOption} from "./gr-sort-control";

export function manageSortSelection(newSelection:string): string {
  let newVal;
  switch (newSelection) {
    case "uploadNewOld":
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
    value: "uploadNewOld",
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
