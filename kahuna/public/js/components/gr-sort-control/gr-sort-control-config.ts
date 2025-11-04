import {SortDropdownOption} from "./gr-sort-control";

export function manageSortSelection(newSelection: string): string {
  if (["newest", "oldest", "-taken", "taken", "dateAddedToCollection", "relevance"].includes(newSelection))
    return newSelection;
  else return "newest"
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

export const RelevanceSortOption =
  {
    value: "relevance",
    label: "Relevance",
    isCollection: false,
    isTaken: false,
  };

export const DefaultSortOption: SortDropdownOption = SortOptions[0];
export const CollectionSortOption: SortDropdownOption = SortOptions[4];
export const HAS_DATE_TAKEN = "has:dateTaken";
export const HASNT_DATE_TAKEN = "-has:dateTaken";
export const TAKEN_SORT = "taken";
export const COLLECTION_SORT_VALUE = SortOptions[4].value;
