import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";

import "./gr-sort-control.css";

const SELECT_OPTION = "Select an option";
const DEFAULT_OPTION = "uploadNewOld";
const COLLECTION_OPTION = "collecAdded";
const CONTROL_TITLE = "Sort by:";

const downArrowIcon = () =>
  <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.178 19.569a.998.998 0 0 0 1.644 0l9-13A.999.999 0 0 0 21 5H3a1.002 1.002 0 0 0-.822 1.569l9 13z"/>
  </svg>;

const emptyIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect width="100%" height="100%" fill="none" stroke="none" />
  </svg>;

const tickIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <polyline fill="none" stroke="inherit" points="3.7 14.3 9.6 19 20.3 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
  </svg>;

export interface SortDropdownOption {
  value: string;
  label: string;
}

export interface SortDropdownProps {
  options: SortDropdownOption[];
  selectedOption?: SortDropdownOption | null;
  onSelect: (option: SortDropdownOption) => void;
  query?: string | "";
}

export interface SortWrapperProps {
  props: SortDropdownProps;
}

const SortControl: React.FC<SortWrapperProps> = ({ props }) => {
  const defOptVal:string = DEFAULT_OPTION;
  const [hasCollection, setHasCollection] = useState(false);
  const options = props.options;
  const defSort:SortDropdownOption = options.filter(opt => opt.value == defOptVal)[0];
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelection] = useState(defSort);

  const checkForCollection = (query:string): boolean => /~"[a-zA-Z0-9 #-_.://]+"/.test(query);

  const handleQueryChange = (e: any) => {
    const newQuery = e.detail.query ? (" " + e.detail.query) : "";
    setHasCollection(checkForCollection(newQuery));
  };

  useEffect(() => {
    if (hasCollection) {
      const collOpt = options.filter(opt => opt.value == COLLECTION_OPTION)[0];
      setSelection(collOpt);
    } else {
      if (selectedOption.value == COLLECTION_OPTION) {
        setSelection(defSort);
      }
    }
  }, [hasCollection]);

  useEffect(() => {
    window.addEventListener('queryChangeEvent', handleQueryChange);
    setSelection(defSort);
    setHasCollection(checkForCollection(props.query));

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('queryChangeEvent', handleQueryChange);
    };
  }, []);

  const handleOptionClick = (option: SortDropdownOption) => {
    setSelection(option);
    setIsOpen(false);
    props.onSelect(option);
  };

  return (
    <div className="outer-sort-container">
      <div className="sort-selection-label">{CONTROL_TITLE}</div>
      <div className="sort-dropdown">
        <button className="sort-dropdown-toggle" onClick={() => setIsOpen(!isOpen)}>
          <div className="sort-selection">
            <div className="sort-selection-label">{(selectedOption ? selectedOption.label : SELECT_OPTION)}</div>
            <div className="sort-selection-icon">{downArrowIcon()}</div>
          </div>
        </button>
        {isOpen && (
          <table className="sort-dropdown-menu">
            <tbody>
            {options.map((option) => (hasCollection || option.value != COLLECTION_OPTION) && (
              <tr className="sort-dropdown-item" key={option.value + "row"} onClick={() => handleOptionClick(option)}>
                <td className="sort-dropdown-cell-tick" key={option.value + "tick"}>
                  {(selectedOption.value == option.value) ? tickIcon() : emptyIcon()}
                </td>
                <td className="sort-dropdown-cell" key={option.value}>
                  {option.label}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export const sortControl = angular.module('gr.sortControl', [])
  .component('sortControl', react2angular(SortControl, ["props"]));
