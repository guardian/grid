import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useState, KeyboardEvent } from "react";
import { DefaultSortOption, CollectionSortOption } from "./gr-sort-control-config";

import "./gr-sort-control.css";

const SELECT_OPTION = "Select an option";
const DEFAULT_OPTION = DefaultSortOption.value;
const COLLECTION_OPTION = CollectionSortOption.value;
const CONTROL_TITLE = "Sort by:";
const SORT_ORDER = "Sort order";
const PANEL_IDENTIFIER = "info";
const HAS_DATE_TAKEN_QUERY = "has:dateTaken";

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

const sortIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 7L4 7" stroke="inherit" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M15 12L4 12" stroke="inherit" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M9 17H4" stroke="inherit" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;

export interface SortDropdownOption {
  value: string;
  label: string;
  isCollection: boolean;
  isTaken: boolean;
}

export interface SortDropdownProps {
  options: SortDropdownOption[];
  selectedOption?: SortDropdownOption | null;
  onSelect: (option: SortDropdownOption) => void;
  query?: string | "";
  orderBy?: string | "";
  previousTaken?: string | "";
  clearTakenVisible: () => void;
  panelVisible?: boolean | false;
}

export interface SortWrapperProps {
  props: SortDropdownProps;
}

const checkForCollection = (query:string): boolean => /~"[a-zA-Z0-9 #-_.://]+"/.test(query);

const hasClassInSelfOrParent = (node: Element | null, className: string): boolean => {
  if (node !== null && node.classList && node.classList.contains(className)) {
    return true;
  }

  while (node && node.parentNode && node.parentNode !== document) {
    node = node.parentNode as Element;
    if (node.classList && node.classList.contains(className)) {
      return true;
    }
  }

  return false;
};

const SortControl: React.FC<SortWrapperProps> = ({ props }) => {
  const defOptVal:string = DEFAULT_OPTION;
  const [hasCollection, setHasCollection] = useState(false);
  const options = props.options;
  const defSort:SortDropdownOption = options.filter(opt => opt.value == defOptVal)[0];
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelection] = useState(defSort);
  const [previousOption, setPrevious] = useState(defSort);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [panelVisible, setPanelVisible] = useState(props.panelVisible);

  const handleArrowKeys = (event:KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      let rowCount = options.length;
      if (!hasCollection) { --rowCount; }
      if (event.key === 'ArrowDown') {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % rowCount);
      } else if (event.key === 'ArrowUp') {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + rowCount) % rowCount);
      } else if (event.key === 'Enter' || event.code === 'Space') {
        if (!isOpen) {
          setCurrentIndex(options.findIndex(opt => opt.value === selectedOption.value));
          setIsOpen(true);
        } else {
          handleOptionClick(options[currentIndex]);
        }
      }
    }
  };

  useEffect(() => {
    if (selectedOption && selectedOption !== previousOption && !selectedOption.isCollection ) {
      setPrevious(selectedOption);
    }
  }, [selectedOption]);

  useEffect(() => {
    const autoHideListener = (event: any) => {
      if (event.type === "keydown" && event.key === "Escape") {
        setIsOpen(false);
      } else if (event.type !== "keydown") {
        if (!hasClassInSelfOrParent(event.target, "sort-control")) {
          setIsOpen(false);
        }
      }
    };

    const handleLogoClick = (e: any) => {
      setSelection(defSort);
    };

    const handleQueryChange = (e: any) => {
      const newQuery = e.detail.query ? (" " + e.detail.query) : "";
      setHasCollection(checkForCollection(newQuery));
    };

    const handlePanelShow = (event: any) => {
      const panel = event.detail.panel;
       if (panel === PANEL_IDENTIFIER) {
         setPanelVisible(true);
       }
    };

    const handlePanelHide = (event: any) => {
      const panel = event.detail.panel;
       if (panel === PANEL_IDENTIFIER) {
         setPanelVisible(false);
       }
    };

    if (props.options.filter(o => o.value === props.orderBy).length > 0) {
      const selOpt = props.options.filter(o => o.value === props.orderBy)[0];
      const tempQuery = props.query ? props.query : "";
      if (!tempQuery.includes(HAS_DATE_TAKEN_QUERY) && selOpt.isTaken) {
        setSelection(defSort);
      } else {
        if (props.previousTaken === selOpt.value || !selOpt.isTaken) {
          setSelection(selOpt);
        } else {
          const tOpt = props.options.filter(o => o.value === props.previousTaken)[0];
          setSelection(tOpt);
        }
      }
    } else {
      setSelection(defSort);
    }

    if (props.query) {
      setHasCollection(checkForCollection(props.query));
    } else if (props.options.filter(o => o.value === props.orderBy).length > 0) {
      setHasCollection(props.options.filter(o => o.value === props.orderBy)[0].isCollection);
    } else {
      setHasCollection(false);
    }

    window.addEventListener("logoClick", handleLogoClick);
    window.addEventListener("queryChangeEvent", handleQueryChange);
    window.addEventListener("mouseup", autoHideListener);
    window.addEventListener("scroll", autoHideListener);
    window.addEventListener("keydown", autoHideListener);
    window.addEventListener("panelHide", handlePanelHide);
    window.addEventListener("panelShow", handlePanelShow);

    // Clean up the event listener when the component unmounts
    return () => {
      setCurrentIndex(-1);
      window.removeEventListener("logoClick", handleLogoClick);
      window.removeEventListener("queryChangeEvent", handleQueryChange);
      window.removeEventListener("mouseup", autoHideListener);
      window.removeEventListener("scroll", autoHideListener);
      window.removeEventListener("keydown", autoHideListener);
      window.removeEventListener("panelHide", handlePanelHide);
      window.removeEventListener("panelShow", handlePanelShow);
    };
  }, []);

  const handleOptionClick = (option: SortDropdownOption) => {
    setIsOpen(false);
    if (option.value !== selectedOption.value) {
      setSelection(option);
      props.onSelect(option);
      if (!option.isTaken) {
        props.clearTakenVisible();
      }

      const orderByChangeEvent = new CustomEvent("orderByChange", {
        detail: {
          sortTaken: option.isTaken,
          sort: option.value
        },
        bubbles: true
      });
      window.dispatchEvent(orderByChangeEvent);
    }
  };

  return (
    <div className={`outer-sort-container ${panelVisible ? 'sort-panel-margin' : ''}`}>
      <div className="sort-selection-title no-select">{CONTROL_TITLE}</div>
      <div className="sort-dropdown" tabIndex={0} aria-label={CONTROL_TITLE} onKeyDown={handleArrowKeys}>
        <div className="sort-dropdown-toggle-advanced" onClick={() => setIsOpen(!isOpen)}>
          <div className="sort-selection">
            <div className="sort-selection-label no-select">{(selectedOption ? selectedOption.label : SELECT_OPTION)}</div>
            <div className="sort-selection-icon">{downArrowIcon()}</div>
          </div>
        </div>
        <div className="sort-dropdown-toggle-basic" onClick={() => setIsOpen(!isOpen)}>
          <div className="sort-selection-basic">
            <div className="sort-selection-icon">{sortIcon()}</div>
            <span className="sort-selection-label no-select">{SORT_ORDER}</span>
          </div>
        </div>
        {isOpen && (
          <table className={`sort-dropdown-menu ${panelVisible ? 'sort-panel-margin' : ''}`}>
            <tbody>
            {options.map((option) => (hasCollection || option.value != COLLECTION_OPTION) && (
              <tr className={(currentIndex > -1 && options[currentIndex].value) === option.value ? "sort-dropdown-item sort-dropdown-highlight" : "sort-dropdown-item"}
                  key={option.value + "row"}
                  onClick={() => handleOptionClick(option)}
                  aria-label={option.label}>
                <td className="sort-dropdown-cell-tick" key={option.value + "tick"}>
                  {(selectedOption.value == option.value) ? tickIcon() : emptyIcon()}
                </td>
                <td className="sort-dropdown-cell no-select" key={option.value}>
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
