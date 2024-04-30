import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState, KeyboardEvent } from "react";
import * as PermissionsConf from "./gr-permissions-filter-config";

import "./gr-permissions-filter.css";
import "./gr-toggle-switch.css";

const SHOW_CHARGEABLE = "Show payable images";
const SHOW_CHARGEABLE_SHORT = "Payable";
const SELECT_OPTION = "Select an option";
const CONTROL_TITLE = "Permissions Selector";
const SELECTED = "Selected";
const NOT_SELECTED = " Not Selected";
const PERMISSIONS = "Permissions";

const chevronIcon = () =>
  <svg fill="inherit" width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.003 18.626l7.081-7.081L25 13.46l-8.997 8.998-9.003-9 1.917-1.916z"/>
  </svg>;

const emptyIcon = () =>
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect width="100%" height="100%" fill="none" stroke="none" />
  </svg>;

const tickIcon = () =>
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <polyline fill="none" stroke="inherit" points="3.7 14.3 9.6 19 20.3 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
  </svg>;

export interface PermissionsDropdownOption {
  value: string;
  label: string;
}

export interface PermissionsDropdownProps {
  options: PermissionsDropdownOption[];
  selectedOption?: PermissionsDropdownOption | null;
  onSelect: (option: PermissionsDropdownOption, showPayable: boolean) => void;
  onChargeable: (showChargeable: boolean) => void;
  chargeable: boolean;
  query?: string | "";
}

export interface PermissionsWrapperProps {
  props: PermissionsDropdownProps;
}

const hasClassInSelfOrParent = (node: Element | null, className: string): boolean => {
  if (node !== null && node.classList.contains(className)) {
    return true;
  }

  while (node && node.parentNode && node.parentNode !== document) {
    node = node.parentNode as Element;
    if (node.classList.contains(className)) {
      return true;
    }
  }

  return false;
};

const PermissionsFilter: React.FC<PermissionsWrapperProps> = ({ props }) => {
  const options:PermissionsDropdownOption[] = props.options;
  const defOptVal:string = PermissionsConf.permissionsDefaultOpt();
  const payableDefaults = PermissionsConf.permissionsPayable();
  const defPerms:PermissionsDropdownOption = options.filter(opt => opt.value == defOptVal)[0];
  const propsRef = useRef(props);

  const [isOpen, setIsOpen] = useState(false);
  const [isChargeable, setIsChargeable] = useState(props.chargeable);
  const [selectedOption, setSelection] = useState(defPerms);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const autoHideListener = (event: any) => {
    if (event.type === "keydown" && event.key === "Escape") {
      setIsOpen(false);
    } else if (event.type !== "keydown") {
      if (!hasClassInSelfOrParent(event.target, "outer-permissions-filters")) {
        setIsOpen(false);
      }
    }
  };

  const handleQueryChange = (e: any ) => {
    const newQuery = e.detail.query ? (" " + e.detail.query) : "";

    //-check chargeable-
    const logoClick = window.sessionStorage.getItem("logoClick") ? window.sessionStorage.getItem("logoClick") : "";
    if (logoClick.includes("logoClick")) {
      setIsChargeable(false);
      window.sessionStorage.setItem("logoClick", "");
    }

    if (propsRef.current.query !== newQuery) {
      propsRef.current.query = newQuery;
      const permMaps = PermissionsConf.permissionsMappings();
      for (let i = 0; i < permMaps.length; i++) {
        if (permMaps[i].query.length > 0 && permMaps[i].query.filter(q => newQuery.includes(q)).length == permMaps[i].query.length) {
          const sel = options.filter(opt => opt.value == permMaps[i].opt)[0];
          setSelection(sel);
          return;
        }
      }

      //-default-
      const lDefOptVal:string = PermissionsConf.permissionsDefaultOpt();
      const lDefPerms:PermissionsDropdownOption = props.options.filter(opt => opt.value == lDefOptVal)[0];
      setSelection(options.filter(opt => opt.value == lDefPerms.value)[0]);
    }
  };

  useEffect(() => {
    window.addEventListener('queryChangeEvent', handleQueryChange);
    window.addEventListener("mouseup", autoHideListener);
    window.addEventListener("scroll", autoHideListener);
    window.addEventListener("keydown", autoHideListener);
    setSelection(defPerms);

    // Clean up the event listener when the component unmounts
    return () => {
      setCurrentIndex(-1);
      window.removeEventListener('queryChangeEvent', handleQueryChange);
      window.removeEventListener("mouseup", autoHideListener);
      window.removeEventListener("scroll", autoHideListener);
      window.removeEventListener("keydown", autoHideListener);
    };
  }, []);

  const handleOptionClick = (option: PermissionsDropdownOption) => {
    const payableDef = payableDefaults.filter(pd => pd.opt === option.value)[0];
    if (payableDef.payable === 'false' || payableDef.payable === 'true') {
        const payableOn = payableDef.payable === 'false' ? false : true;
        setIsChargeable(payableOn);
        props.onSelect(option, payableOn);
    } else {
      props.onSelect(option, isChargeable);
    }
    setSelection(option);
    setIsOpen(false);
  };

  useEffect(() => {
    props.onChargeable(isChargeable);
  }, [isChargeable]);

  const handleToggle = () => {
    setIsChargeable(prevState => !prevState);
  };

  const handleKeyToggle = (event:KeyboardEvent<HTMLDivElement>) => {
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      handleToggle();
    }
  };

  const handleKeyboard = (event:KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      let rowCount = options.length;
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

  return (
      <div className="outer-permissions-filters">
        <div className="dropdown permissions-dropdown" tabIndex={0} aria-label={CONTROL_TITLE} onKeyDown={handleKeyboard}>
          <div className="dropdown-toggle" onClick={() => setIsOpen(!isOpen)}>
            <div className="permissions-selection">
              <div className="permissions-selection-label no-select">{(selectedOption ? selectedOption.label : SELECT_OPTION)}</div>
              <div className="permissions-selection-label-short no-select">{PERMISSIONS}</div>
              <div className="permissions-selection-icon">{chevronIcon()}</div>
            </div>
          </div>
          {isOpen && (
            <table className="permissions-dropdown-menu">
              <tbody>
              {options.map((option) => (
                <tr className={(currentIndex > -1 && options[currentIndex].value) === option.value ? "permissions-dropdown-item permissions-dropdown-highlight" : "permissions-dropdown-item"}
                    key={option.value + "row"}
                    aria-label={option.label}
                    onClick={() => handleOptionClick(option)}>
                  <td className="permissions-dropdown-cell-tick" key={option.value + "tick"}>
                    {(selectedOption.value == option.value) ? tickIcon() : emptyIcon()}
                  </td>
                  <td className="permissions-dropdown-cell no-select" key={option.value}>
                    {option.label}
                  </td>
                </tr>
              ))}
              </tbody>
             </table>
          )}
        </div>
        <div className="ts-toggle-container" tabIndex={0} aria-label={SHOW_CHARGEABLE + " " + (isChargeable ? SELECTED : NOT_SELECTED)} onKeyDown={handleKeyToggle} onClick={handleToggle}>
          <div className="ts-toggle-label no-select">{SHOW_CHARGEABLE}</div>
          <label className="ts-toggle-switch">
            <input type="checkbox" checked={isChargeable} onChange={handleToggle}/>
            <span className="ts-slider"></span>
          </label>
        </div>
        <div className="ts-toggle-container-short" tabIndex={0} aria-label={SHOW_CHARGEABLE + " " + (isChargeable ? SELECTED : NOT_SELECTED)} onKeyDown={handleToggle}>
          <label className="chargeable-checkbox">
            <input type="checkbox" checked={isChargeable} onChange={handleToggle}/>
            <div className="chargeable-label-wrapper" >
              <span className="chargeable-span"></span>
              <span className="chargeable-label no-select">{SHOW_CHARGEABLE_SHORT}</span>
            </div>
          </label>
        </div>
      </div>
  );
};

export const permissionsFilter = angular.module('gr.permissionsFilter', [])
  .component('permissionsFilter', react2angular(PermissionsFilter, ["props"]));
