import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState } from "react";
import * as PermisionsConf from "./gr-permissions-filter-config";

import styles from "./gr-permissions-filter.module.css";

const CloseIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <path d="m12.45 37.65-2.1-2.1L21.9 24 10.35 12.45l2.1-2.1L24 21.9l11.55-11.55 2.1 2.1L26.1 24l11.55 11.55-2.1 2.1L24 26.1Z"/>
  </svg>;

const InfoIcon = ({className} : {className: string}) =>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={className}>
    <path d="M22.35 34.3h3.6V22h-3.6ZM24 18.7q.9 0 1.475-.575.575-.575.575-1.425 0-.95-.575-1.525T24 14.6q-.9 0-1.475.575-.575.575-.575 1.525 0 .85.575 1.425.575.575 1.475.575Zm0 26q-4.3 0-8.05-1.625-3.75-1.625-6.575-4.45t-4.45-6.575Q3.3 28.3 3.3 24q0-4.35 1.625-8.1T9.35 9.35q2.8-2.8 6.575-4.45Q19.7 3.25 24 3.25q4.35 0 8.125 1.65 3.775 1.65 6.55 4.425t4.425 6.55Q44.75 19.65 44.75 24q0 4.3-1.65 8.075-1.65 3.775-4.45 6.575-2.8 2.8-6.55 4.425T24 44.7Zm.05-3.95q6.95 0 11.825-4.9 4.875-4.9 4.875-11.9 0-6.95-4.875-11.825Q31 7.25 24 7.25q-6.95 0-11.85 4.875Q7.25 17 7.25 24q0 6.95 4.9 11.85 4.9 4.9 11.9 4.9ZM24 24Z"/>
  </svg>;


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
    <div className="dropdown">
      <button className="dropdown-toggle" onClick={() => setIsOpen(!isOpen)}>
        {selectedOption ? selectedOption.label : 'Select an option'}
      </button>
      {isOpen && (
        <ul className="dropdown-menu">
          {options.map((option) => (
            <li key={option.value} onClick={() => handleOptionClick(option)}>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const permissionsFilter = angular.module('gr.permissionsFilter', [])
  .component('permissionsFilter', react2angular(PermissionsFilter, ["props"]));

