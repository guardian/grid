import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";
import * as PermissionsConf from "./gr-permissions-filter-config";

import ToggleSwitch from "./gr-toggle-switch";
import "./gr-permissions-filter.css";

const SHOW_CHARGEABLE:string = "Show Chargeable";

const ChevronIcon = () =>
  <svg fill="inherit" width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.003 18.626l7.081-7.081L25 13.46l-8.997 8.998-9.003-9 1.917-1.916z"/>
  </svg>

const EmptyIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect width="100%" height="100%" fill="none" />
  </svg>

const TickIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <polyline fill="none" points="3.7 14.3 9.6 19 20.3 5" stroke="#ccc" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
  </svg>

export interface PermissionsDropdownOption {
  value: string;
  label: string;
}

export interface PermissionsDropdownProps {
  options: PermissionsDropdownOption[];
  selectedOption?: PermissionsDropdownOption | null;
  onSelect: (option: PermissionsDropdownOption) => void;
  chargeable: boolean;
  query?: string | "";
  userType?: string | "standard";
}

export interface PermissionsWrapperProps {
  props: PermissionsDropdownProps;
}

// *** functional react component ***
const PermissionsFilter: React.FC<PermissionsWrapperProps> = ({ props }) => {
  const options:PermissionsDropdownOption[] = props.options;
  const defOptVal:string = PermissionsConf.PermissionsDefaultOpt().filter(ut => ut.includes(props.userType))[0].split("#")[1];
  const defPerms:PermissionsDropdownOption = options.filter(opt => opt.value == defOptVal)[0];
  const propsRef = useRef(props);

  const [isOpen, setIsOpen] = useState(false);
  const [isChargeable, setIsChargeable] = useState(props.chargeable);
  const [selectedOption, setSelection] = useState(defPerms);

  const handleQueryChange = (e: any) => {
    let newQuery = e.detail.query ? (' ' + e.detail.query) : '';
    if (propsRef.current.query !== newQuery) {
      propsRef.current.query = newQuery;

      const permMaps = PermissionsConf.PermissionsMappings();
      for(let i=0; i<permMaps.length; i++) {
        if(permMaps[i].query.length > 0 && permMaps[i].query.filter(q => newQuery.includes(q)).length == permMaps[i].query.length) {
          setSelection(options.filter(opt => opt.value == permMaps[i].opt)[0]);
          return;
        }
      }

      //-default-
      let lDefOptVal:string = PermissionsConf.PermissionsDefaultOpt().filter(ut => ut.includes(props.userType))[0].split("#")[1];
      let lDefPerms:PermissionsDropdownOption = props.options.filter(opt => opt.value == lDefOptVal)[0];
      setSelection(options.filter(opt => opt.value == lDefPerms.value)[0]);
    }
  };

  useEffect(() => {
    window.addEventListener('queryChangeEvent', handleQueryChange);
    setSelection(defPerms);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('queryChangeEvent', handleQueryChange);
    };
  }, []);

  const handleOptionClick = (option: PermissionsDropdownOption) => {
    props.onSelect(option);
    setSelection(option);
    setIsOpen(false);
  };

  return (
      <div className="outer-permissions-filters">
        <ToggleSwitch label={SHOW_CHARGEABLE} chargeable={isChargeable} />
        <div className="dropdown permissions-dropdown">
          <button className="dropdown-toggle" onClick={() => setIsOpen(!isOpen)}>
            <div className="permissions-selection">
              <div className="permissions-selection-label">{(selectedOption ? selectedOption.label : 'Select an option')}</div>
              <div className="permissions-selection-icon">{ChevronIcon()}</div>
            </div>
          </button>
          {isOpen && (
            <table className="permissions-dropdown-menu">
              <tbody>
              {options.map((option) => (
                <tr className="permissions-dropdown-item" onClick={() => handleOptionClick(option)}>
                  <td className="permissions-dropdown-cell" key={option.value + "tick"}>
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
      </div>
  );
};

export const permissionsFilter = angular.module('gr.permissionsFilter', [])
  .component('permissionsFilter', react2angular(PermissionsFilter, ["props"]));

