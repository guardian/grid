import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useEffect, useRef, useState, KeyboardEvent } from "react";
import * as PermissionsConf from "./gr-permissions-filter-config";
import { nfLog } from "../../util/nonfree-debug";

import "./gr-permissions-filter.css";
import "./gr-toggle-switch.css";

let pfInstances = 0;
let toggleSeq = 0;
let nativeEventSeq = 0;
let lastNativeEvent: Event | null = null;

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

//-- payable images event (optional param to avoid CI check issues) --
interface PayableImagesEventDetail { showPaid: boolean }
interface PayableImagesEvent extends CustomEvent<PayableImagesEventDetail> {optional?: string}

//-- query change event - adding optional param to avoid CI/CD check issue!--
interface QueryChangeEventDetail { query: string, showPaid: boolean }
interface QueryChangeEvent extends CustomEvent<QueryChangeEventDetail> {optional?: string}

//-- logo click event --
interface LogoClickEventDetail { showPaid: boolean }
interface LogoClickEvent extends CustomEvent<LogoClickEventDetail> {optional?: string}

//-- react control--
const PermissionsFilter: React.FC<PermissionsWrapperProps> = ({ props }) => {
  const options:PermissionsDropdownOption[] = props.options;
  const defOptVal:string = PermissionsConf.permissionsDefaultOpt();
  const payableDefaults = PermissionsConf.permissionsPayable();
  const defPerms:PermissionsDropdownOption = options.filter(opt => opt.value == defOptVal)[0];
  const propsRef = useRef(props);

  const instanceId = useRef("");
  if (instanceId.current === "") {
    instanceId.current = `PermissionsFilter#${++pfInstances}`;
    nfLog(instanceId.current, "construct", {propsChargeable: props.chargeable, propsQuery: props.query});
  }

  const [isOpen, setIsOpen] = useState(false);
  const [isChargeable, setIsChargeable] = useState(props.chargeable);
  const [selectedOption, setSelection] = useState(defPerms);
  const [currentIndex, setCurrentIndex] = useState(-1);

  nfLog(instanceId.current, "render", {propsChargeable: props.chargeable, isChargeable});

  // `chargeable` is owned by AngularJS, which drives the URL. Only push back
  // values the user originated here, otherwise the two fight over the router.
  const lastChargeable = useRef(props.chargeable);
  const isMountEffect = useRef(true);
  const changeCameFromProps = useRef(false);

  const autoHideListener = (event: any) => {
    if (event.type === "keydown" && event.key === "Escape") {
      setIsOpen(false);
    } else if (event.type !== "keydown") {
      if (!hasClassInSelfOrParent(event.target, "outer-permissions-filters")) {
        setIsOpen(false);
      }
    }
  };

  const handleLogoClick = (event: LogoClickEvent) => {
    nfLog(instanceId.current, "handleLogoClick", {showPaid: event.detail.showPaid});
    setIsChargeable(event.detail.showPaid);
  };

  const handleSetPayableImages = (event: PayableImagesEvent) => {
    nfLog(instanceId.current, "handleSetPayableImages", {showPaid: event.detail.showPaid});
    setIsChargeable(event.detail.showPaid);
  };

  const syncSelectionFromQuery = (rawQuery: string | undefined) => {
    const newQuery = rawQuery ? (" " + rawQuery) : "";

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

  const handleQueryChange = (event: QueryChangeEvent) => {
    syncSelectionFromQuery(event.detail.query);
  };

  useEffect(() => {
    window.addEventListener('queryChangeEvent', handleQueryChange);
    window.addEventListener('logoClick', handleLogoClick);
    window.addEventListener('setPayableImages', handleSetPayableImages);
    window.addEventListener('mouseup', autoHideListener);
    window.addEventListener('scroll', autoHideListener);
    window.addEventListener('keydown', autoHideListener);

    nfLog(instanceId.current, "mounted (listeners attached)");

    // Clean up the event listener when the component unmounts
    return () => {
      nfLog(instanceId.current, "UNMOUNT (listeners detached)");
      setCurrentIndex(-1);
      window.removeEventListener('queryChangeEvent', handleQueryChange);
      window.removeEventListener('logoClick', handleLogoClick);
      window.removeEventListener('setPayableImages', handleSetPayableImages);
      window.removeEventListener('mouseup', autoHideListener);
      window.removeEventListener('scroll', autoHideListener);
      window.removeEventListener('keydown', autoHideListener);
    };
  }, []);

  useEffect(() => {
    syncSelectionFromQuery(props.query);
  }, [props.query]);

  useEffect(() => {
    const desync = isChargeable !== props.chargeable && lastChargeable.current === props.chargeable;
    nfLog(instanceId.current, desync ? "effect[props.chargeable] DESYNC - update ignored" : "effect[props.chargeable]", {
      propsChargeable: props.chargeable,
      lastChargeable: lastChargeable.current,
      isChargeable,
      willAdopt: lastChargeable.current !== props.chargeable
    });
    if (lastChargeable.current !== props.chargeable) {
      lastChargeable.current = props.chargeable;
      changeCameFromProps.current = true;
      setIsChargeable(props.chargeable);
    }
  }, [props.chargeable]);

  const handleOptionClick = (option: PermissionsDropdownOption) => {
    nfLog(instanceId.current, "handleOptionClick", {option: option.value, isChargeable});
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
    nfLog(instanceId.current, "effect[isChargeable]", {
      isChargeable,
      propsChargeable: props.chargeable,
      lastChargeable: lastChargeable.current,
      isMountEffect: isMountEffect.current,
      changeCameFromProps: changeCameFromProps.current
    });
    lastChargeable.current = isChargeable;
    if (isMountEffect.current) {
      isMountEffect.current = false;
      return;
    }
    if (changeCameFromProps.current) {
      changeCameFromProps.current = false;
      return;
    }
    nfLog(instanceId.current, "-> props.onChargeable", {isChargeable});
    props.onChargeable(isChargeable);
  }, [isChargeable]);

  const handleToggle = (event?: {nativeEvent?: Event, currentTarget?: Element}) => {
    const native = event && event.nativeEvent ? event.nativeEvent : null;
    if (native !== lastNativeEvent) {
      lastNativeEvent = native;
      nativeEventSeq++;
    }
    const target = event && event.currentTarget
      ? `${event.currentTarget.tagName}.${event.currentTarget.className}`
      : "unknown";
    nfLog(instanceId.current, "handleToggle (user click)", {
      toggleSeq: ++toggleSeq,
      nativeEventSeq,
      boundTo: target,
      isChargeable,
      propsChargeable: props.chargeable
    });
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
      const rowCount = options.length;
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
        {/* The checkboxes are hidden by CSS and exist only to drive the `:checked`
            sibling selectors; clicks are owned solely by the container, and the
            wrappers are spans rather than labels so the browser doesn't re-dispatch
            a second click onto the input. */}
        <div className="ts-toggle-container" tabIndex={0} aria-label={SHOW_CHARGEABLE + " " + (isChargeable ? SELECTED : NOT_SELECTED)} onKeyDown={handleKeyToggle} onClick={handleToggle}>
          <div className="ts-toggle-label no-select">{SHOW_CHARGEABLE}</div>
          <span className="ts-toggle-switch">
            <input type="checkbox" checked={isChargeable} readOnly tabIndex={-1} aria-hidden="true"/>
            <span className="ts-slider"></span>
          </span>
        </div>
        <div className="ts-toggle-container-short" tabIndex={0} aria-label={SHOW_CHARGEABLE + " " + (isChargeable ? SELECTED : NOT_SELECTED)} onKeyDown={handleKeyToggle} onClick={handleToggle}>
          <span className="chargeable-checkbox">
            <input type="checkbox" checked={isChargeable} readOnly tabIndex={-1} aria-hidden="true"/>
            <div className="chargeable-label-wrapper" >
              <span className="chargeable-span"></span>
              <span className="chargeable-label no-select">{SHOW_CHARGEABLE_SHORT}</span>
            </div>
          </span>
        </div>
      </div>
  );
};

export const permissionsFilter = angular.module('gr.permissionsFilter', [])
  .component('permissionsFilter', react2angular(PermissionsFilter, ["props"]));
