/*import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";

import "./gr-sort-control.css.css";

const UPLOAD_NEW_TO_OLD:string = "Upload date (new to old)";
const UPLOAD_OLD_TO_NEW:string = "Upload date (old to new)";
const COLLECTION_ADDED_NEW_TO_OLD:string = "Added to collection (new to old)";
const COLLECTION_ADDED_OLD_TO_NEW:string = "Added to collection (old to new)";
const LAST_MODIFIED:string = "Last modified";
const SELECT:string = "Select...";

const ChevronIcon = () =>
  <svg fill="inherit" width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.003 18.626l7.081-7.081L25 13.46l-8.997 8.998-9.003-9 1.917-1.916z"/>
  </svg>

const EmptyIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect width="100%" height="100%" fill="none" stroke="none" />
  </svg>

const TickIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <polyline fill="none" stroke="inherit" points="3.7 14.3 9.6 19 20.3 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
  </svg>

export interface SortOption {
  value: string;
  label: string;
}

export interface SortProps {
  default: string;
}

export interface SortWrapperProps {
  props: SortProps;
}

// *** functional react component ***
const SortControl: React.FC<SortWrapperProps> = ({ props }) => {
  const defaultOption:SortOption = {
    value: "select",
    label: SELECT
  }
  const propsRef = useRef(props);
  let options = new Array<SortOption>();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelection] = useState(defaultOption);

  const handleSortChange = (e: any) => {
    // react to sort from Angular
  };

  useEffect(() => {
    window.addEventListener('sortChangeEvent', handleSortChange);
    setSelection(defaultOption);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('sortChangeEvent', handleSortChange);
    };
  }, []);

  const handleOptionClick = (option: PermissionsDropdownOption) => {
    const payableDef = payableDefaults.filter(pd => pd.opt === option.value)[0];
    if(payableDef.payable === 'false' || payableDef.payable === 'true') {
      const payableOn = payableDef.payable === 'false' ? false : true;
      setIsChargeable(payableOn);
      props.onSelect(option, payableOn);
    } else {
      props.onSelect(option, isChargeable);
    }
    setSelection(option);
    setIsOpen(false);
  };

  return (
    <div className="outer-permissions-filters">
      <div className="dropdown permissions-dropdown">
        <button className="dropdown-toggle" onClick={() => setIsOpen(!isOpen)}>
          <div className="permissions-selection">
            <div className="permissions-selection-label">{(selectedOption ? selectedOption.label : SELECT_OPTION)}</div>
            <div className="permissions-selection-icon">{ChevronIcon()}</div>
          </div>
        </button>
        {isOpen && (
          <table className="permissions-dropdown-menu">
            <tbody>
            {options.map((option) => (
              <tr className="permissions-dropdown-item" key={option.value + "row"} onClick={() => handleOptionClick(option)}>
                <td className="permissions-dropdown-cell-tick" key={option.value + "tick"}>
                  {(selectedOption.value == option.value)?TickIcon():EmptyIcon()}
                </td>
                <td className="permissions-dropdown-cell" key={option.value}>
                  {option.label}
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="ts-toggle-container">
        <div className="ts-toggle-label">{SHOW_CHARGEABLE}</div>
        <label className="ts-toggle-switch">
          <input type="checkbox" checked={isChargeable} onChange={handleToggle} />
          <span className="ts-slider"></span>
        </label>
      </div>
    </div>
  );
};

export const permissionsFilter = angular.module('gr.permissionsFilter', [])
  .component('permissionsFilter', react2angular(PermissionsFilter, ["props"]));


 */
