import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useState } from "react";
import { BaseSortControl, SortDropdownOption } from "./base-sort-control";
import { SortOptions, DefaultSortOption } from "./gr-sort-control-config";
import { TabControl } from "../gr-tab-swap/gr-tab-swap";

import "./gr-sort-control.css";

export interface ExtendedSortProps {
  onSortSelect: (option: SortDropdownOption, tabSelected: string, userTakenSelect: boolean) => void;
  query?: string | "";
  orderBy?: string | "";
  infoPanelVisible?: boolean | false;
  collectionsPanelVisible?: boolean | false;
  userTakenSelect?: boolean | false;
  noTakenDateCount?: number | 0;
}

export interface ExtendedSortWrapperProps {
  props: ExtendedSortProps;
}

const checkForCollection = (query:string): boolean => /~"[a-zA-Z0-9 #-_.://]+"/.test(query);

const deriveExtendedSortState = (
  query: string,
  orderBy: string,
  sortOptions: SortDropdownOption[],
  noTakenDateClause: string
) => {
  let selectedSort = DefaultSortOption;
  if (!query.includes(noTakenDateClause)) {
    selectedSort = sortOptions.find(o => o.value === orderBy) || DefaultSortOption;
  }
  return {
    selectedSort,
    hasCollection: checkForCollection(query)
  };
};

const ExtendedSortControl: React.FC<ExtendedSortWrapperProps> = ({ props }) => {

  const noTakenDateClause = "-has:dateTaken";
  const takenDateClause = "has:dateTaken";
  const sortOptions = SortOptions;
  const orderBy = props.orderBy || "";
  const query = props.query || "";
  const { selectedSort: startSortOption, hasCollection: startHasCollection } =
    deriveExtendedSortState(query, orderBy, sortOptions, noTakenDateClause);
  const [selSortOption, setSortOption] = useState<SortDropdownOption>(startSortOption);
  const [userTakenSelect, setUserTakenSelect] = useState<boolean>(props.userTakenSelect);
  const noTakenDateCount = props.noTakenDateCount;
  const [hasCollection, setHasCollection] = useState<boolean>(startHasCollection);

  useEffect(() => {
    const { selectedSort, hasCollection: nextHasCollection } =
      deriveExtendedSortState(query, orderBy, sortOptions, noTakenDateClause);
    setSortOption(selectedSort);
    setHasCollection(nextHasCollection);
    setUserTakenSelect(Boolean(props.userTakenSelect));
  }, [query, orderBy, props.userTakenSelect]);

  const onSortSelect = (selOption: SortDropdownOption) => {
    setSortOption(selOption);
    setUserTakenSelect(selOption.isTaken);
    props.onSortSelect(selOption, 'with', selOption.isTaken);
  };

  const onTabSelect = (withTaken: boolean) => {
    let withTakenStr = 'with';
    if (!withTaken) {
      withTakenStr = 'without';
      setSortOption(DefaultSortOption);
    }
    props.onSortSelect(selSortOption, withTakenStr, userTakenSelect);
  };

  // initialisation
  useEffect(() => {
    const handleLogoClick = (e: any) => {
      setSortOption(DefaultSortOption);
      setUserTakenSelect(false);
      props.onSortSelect(DefaultSortOption, 'with', false);
    };

    const handleQueryChange = (e: any) => {
      const newQuery = e.detail.query ? (" " + e.detail.query) : "";
      setHasCollection(checkForCollection(newQuery));
      if (userTakenSelect && !newQuery.includes(takenDateClause)) {
        props.onSortSelect(DefaultSortOption, 'with', false);
      }
    };

    window.addEventListener("logoClick", handleLogoClick);
    window.addEventListener("queryChangeEvent", handleQueryChange);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener("logoClick", handleLogoClick);
      window.removeEventListener("queryChangeEvent", handleQueryChange);
    };

  }, []);

  return (
    <div className="extended-sort-control">
      <TabControl
        onSelect={onTabSelect}
        query={query}
        showTakenTab={userTakenSelect}
        noTakenDateCount={noTakenDateCount}
        panelVisible={props.collectionsPanelVisible}
      />
      <BaseSortControl
        options={sortOptions}
        startSelectedOption={selSortOption}
        onSelect={onSortSelect}
        startHasCollection={hasCollection}
        panelVisible={props.infoPanelVisible}
      />
    </div>
  );
};

export const extendedSortControl = angular.module('gr.extendedSortControl', [])
  .component('extendedSortControl', react2angular(ExtendedSortControl, ["props"]));
