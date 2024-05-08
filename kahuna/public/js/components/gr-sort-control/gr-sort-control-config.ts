import {SortDropdownOption} from "./gr-sort-control";
import strings from '../../strings.json';

const CONTROL_NAME = "gr-sort-control";
const defaultLabels = {
  uploadNewOld: "Upload date (new to old)",
  oldest: "Upload date (old to new)",
  dateAddedToCollection: "Added to Collection (recent 1st)"
};

const getLabel = (key: string): string => {
  const fullKey = `${CONTROL_NAME}_${key}`;
  if (fullKey in strings) {
    return strings[fullKey as keyof typeof strings];
  } else {
    return defaultLabels[key as keyof typeof defaultLabels];
  }
};

export function manageSortSelection(newSelection:string): string {
  let newVal;
  switch (newSelection) {
    case "uploadNewOld":
      newVal = undefined;
      break;
    case "oldest":
      newVal = "oldest";
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
    label: getLabel("uploadNewOld"),
    isCollection: false
  },
  {
    value: "oldest",
    label: getLabel("oldest"),
    isCollection: false
  },
  {
    value: "dateAddedToCollection",
    label: getLabel("dateAddedToCollection"),
    isCollection: true
  }
];

export const DefaultSortOption: SortDropdownOption = SortOptions[0];
export const CollectionSortOption: SortDropdownOption = SortOptions[2];
