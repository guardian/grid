import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useState } from "react";
import { BaseSortControl, SortDropdownOption } from "./base-sort-control";
import { SortOptions, DefaultSortOption } from "./gr-sort-control-config";

export type { SortDropdownOption };
export interface SortProps {
  onSortSelect: (option: SortDropdownOption) => void;
  query?: string | "";
  orderBy?: string | "";
}

export interface SortWrapperProps {
  props: SortProps;
}

const checkForCollection = (query:string): boolean => /~"[a-zA-Z0-9 #-_.://]+"/.test(query);

const deriveSortState = (query: string, orderBy: string, sortOptions: SortDropdownOption[]) => {
  const hasCollection = checkForCollection(query);
  if (hasCollection) {
    const collectionSort = sortOptions.find(o => o.isCollection) || DefaultSortOption;
    return { hasCollection, selectedSort: collectionSort };
  }

  const selectedSort = sortOptions.find(o => o.value === orderBy) || DefaultSortOption;
  return { hasCollection, selectedSort };
};

const SortControl: React.FC<SortWrapperProps> = ({ props }) => {

  const sortOptions = SortOptions;
  const orderBy = props.orderBy || "";
  const query = props.query || "";
  const { hasCollection: startHasCollection, selectedSort: startSortOption } =
    deriveSortState(query, orderBy, sortOptions);

  const [selSortOption, setSortOption] = useState<SortDropdownOption>(startSortOption);
  const [hasCollection, setHasCollection] = useState<boolean>(startHasCollection);

  useEffect(() => {
    const { hasCollection: nextHasCollection, selectedSort } = deriveSortState(query, orderBy, sortOptions);
    setHasCollection(nextHasCollection);
    setSortOption(selectedSort);
  }, [query, orderBy]);

  const onSortSelect = (selOption: SortDropdownOption) => {
    setSortOption(selOption);
    props.onSortSelect(selOption);
  };

  // initialisation
  useEffect(() => {
    const handleQueryChange = (e: any) => {
      const newQuery = e.detail.query ? (" " + e.detail.query) : "";
      const curHasCollec = e.detail.hasCollection ? e.detail.hasCollection : false;
      const orderBy = e.detail.orderBy ? e.detail.orderBy : DefaultSortOption.value;
      const newHasCollec = checkForCollection(newQuery);
      setHasCollection(newHasCollec);
      if (!curHasCollec && newHasCollec) {
        let collecSortOption = DefaultSortOption;
        if ((sortOptions.filter(o => o.isCollection)).length > 0) {
          collecSortOption = sortOptions.filter(o => o.isCollection)[0];
        }
        setSortOption(collecSortOption);
      }
      const eventOrderOpt = (sortOptions.filter(o => o.value == orderBy))[0];
      if (!newHasCollec && curHasCollec && eventOrderOpt.isCollection) {
        setSortOption(DefaultSortOption);
      }
    };

    window.addEventListener("queryChangeEvent", handleQueryChange);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener("queryChangeEvent", handleQueryChange);
    };

  }, []);

  return (
    <BaseSortControl
      options={sortOptions}
      startSelectedOption={selSortOption}
      onSelect={onSortSelect}
      startHasCollection={hasCollection}
      panelVisible={false}
      isSimple={true}
    />
  );
};

export const sortControl = angular.module('gr.sortControl', [])
  .component('sortControl', react2angular(SortControl, ["props"]));
