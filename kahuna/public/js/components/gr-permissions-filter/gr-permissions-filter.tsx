import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";
import * as PermisionsConf from "./gr-permissions-filter-config";

import "./gr-permissions-filter.css";

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
  query?: string | "";
}

export interface PermissionsWrapperProps {
  props: PermissionsDropdownProps;
}

// *** functional react component ***
const PermissionsFilter: React.FC<PermissionsWrapperProps> = ({ props }) => {
  const options:PermissionsDropdownOption[] = props.options;
  const allPerms:PermissionsDropdownOption = options.filter(opt => opt.value == PermisionsConf.PermissionsDefaultOpt())[0];
  const propsRef = useRef(props);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelection] = useState(allPerms);

  const handleQueryChange = (e: any) => {
    let newQuery = e.detail.query ? (' ' + e.detail.query) : '';
    if (propsRef.current.query !== newQuery) {
      propsRef.current.query = newQuery;

      const permMaps = PermisionsConf.PermissionsMappings();
      for(let i=0; i<permMaps.length; i++) {
        if(permMaps[i].queries.length > 0 && permMaps[i].queries.filter(q => newQuery.includes(q)).length == permMaps[i].queries.length) {
          setSelection(options.filter(opt => opt.value == permMaps[i].opt)[0]);
          return;
        }
      }

      //-default-
      setSelection(options.filter(opt => opt.value == PermisionsConf.PermissionsDefaultOpt())[0]);
    }
  };

  useEffect(() => {
    window.addEventListener('queryChangeEvent', handleQueryChange);
    setSelection(allPerms);

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
      <div className="dropdown permissions-dropdown">
        <button className="dropdown-toggle" onClick={() => setIsOpen(!isOpen)}>
          <div className="permissions-selection">
            <div className="permissions-selection-label">{(selectedOption ? selectedOption.label : 'Select an option')}</div>
            <div className="permissions-selection-icon">{ChevronIcon()}</div>
          </div>
        </button>
        {isOpen && (
          <table className="permissions-dropdown-menu">
            {options.map((option) => (
              <tr className="permissions-dropdown-item">
                <td className="permissions-dropdown-cell">
                  {(selectedOption.value == option.value)?TickIcon():EmptyIcon()}
                </td>
                <td className="permissions-dropdown-cell" key={option.value} onClick={() => handleOptionClick(option)}>
                  {option.label}
                </td>
              </tr>
            ))}
          </table>
        )}
      </div>
  );
};

export const permissionsFilter = angular.module('gr.permissionsFilter', [])
  .component('permissionsFilter', react2angular(PermissionsFilter, ["props"]));

