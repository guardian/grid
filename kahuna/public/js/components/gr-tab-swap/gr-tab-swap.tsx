import * as React from "react";
import * as angular from "angular";
import { useState, useEffect, KeyboardEvent } from "react";
import { react2angular } from "react2angular";

import './gr-tab-swap.css';

export interface TabSwapProps {
  orderBy: string;
  query: string;
  without: string;
  taken: string;
  onSelect: (selected: string, sort: string) => void;
  takenVisible: string;
  clearTakenVisible: () => void;
  setTakenVisible: () => void;
  noTakenDateCount: number;
  panelVisible: boolean;
}

export interface TabSwapWrapperProps {
  props: TabSwapProps;
}

type TabType = 'with' | 'without';

const TabControl: React.FC<TabSwapWrapperProps> = ({props}) => {

  const withLabel = "With taken date";
  const withoutLabel = "Without taken date";
  const CONTROL_TITLE = "Has Taken Date Selector";
  const PANEL_IDENTIFIER = "collections";
  const HAS_DATE_TAKEN_QUERY = "has:dateTaken";

  // map props to state
  const hasWithoutVal = props.query.includes(props.without);
  const hasTakenSort = props.orderBy.includes(props.taken);
  const tempTakenVisible = (props.takenVisible == 'visible');
  const noTakenDateCount = props.query.includes(HAS_DATE_TAKEN_QUERY) ? props.noTakenDateCount : 0;

  const [activeTab, setActiveTab] = useState<TabType>(hasWithoutVal ? 'without' : 'with');
  const [sortTaken, setSortTaken] = useState<boolean>(hasTakenSort);
  const [takenVisible, setTakenVisible] = useState<boolean>(tempTakenVisible);
  const [panelVisible, setPanelVisible] = useState<boolean>(props.panelVisible);

  const handleTabClick = (tabSelected: string) => {
    if (tabSelected !== activeTab) {
      if (tabSelected === 'with') {
        setActiveTab('with');
        props.clearTakenVisible();
        const orderBy = props.orderBy.includes(props.taken) ? props.orderBy : ("-" + props.taken);
        props.onSelect(tabSelected, orderBy);
      } else {
        setActiveTab('without');
        props.setTakenVisible();
        props.onSelect(tabSelected, undefined);
      }
    }
  };

  const handleKeyboard = (event:KeyboardEvent<HTMLDivElement>) => {
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      const tabSelected = activeTab;
      if (tabSelected === 'without') {
        setActiveTab('with');
        props.clearTakenVisible();
        const orderBy = props.orderBy.includes(props.taken) ? props.orderBy : ("-" + props.taken);
        props.onSelect('with', orderBy);
      } else {
        setActiveTab('without');
        props.setTakenVisible();
        props.onSelect('without', undefined);
      }
    }
  };

  useEffect(() => {
    const handleLogoClick = (e: any) => {
      setActiveTab('with');
      setSortTaken(false);
      setTakenVisible(false);
      props.clearTakenVisible();
    };

    const handleOrderByChange = (e: any) => {
        const newTaken = e.detail.sortTaken ? e.detail.sortTaken : false;
        if (newTaken) {
          props.onSelect('with', e.detail.sort);
        } else {
          props.onSelect('without', e.detail.sort);
        }
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

    window.addEventListener("logoClick", handleLogoClick);
    window.addEventListener("orderByChange", handleOrderByChange);
    window.addEventListener("panelHide", handlePanelHide);
    window.addEventListener("panelShow", handlePanelShow);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener("logoClick", handleLogoClick);
      window.removeEventListener("orderByChange", handleOrderByChange);
      window.removeEventListener("panelHide", handlePanelHide);
      window.removeEventListener("panelShow", handlePanelShow);
    };
  }, []);

  return (
    <div className={`gr-tab-wrapper ${panelVisible ? 'gr-tab-panel-margin' : ''}`}>
      {((sortTaken || takenVisible) && (noTakenDateCount > 0)) && (
        <div className="gr-tab-container" tabIndex={0} aria-label={`${CONTROL_TITLE}. ${activeTab} Taken Date selected`} onKeyDown={handleKeyboard}>
          <div
            className={`gr-tab ${activeTab === 'with' ? 'active' : ''}`}
            onClick={() => handleTabClick('with')}
            aria-label={`${withLabel} ${activeTab === 'with' ? 'selected' : ''}`}
          >
            {withLabel}
          </div>
          <div
            className={`gr-tab ${activeTab === 'without' ? 'active' : ''}`}
            onClick={() => handleTabClick('without')}
            aria-label={`${withoutLabel} ${activeTab === 'without' ? 'selected' : ''}`}
          >
            {`${withoutLabel} (${props.noTakenDateCount} matches)`}
          </div>
        </div>
      )}
    </div>
  );
};

export const tabSwapControl = angular.module('gr.tabSwapControl', [])
  .component('tabSwapControl', react2angular(TabControl, ["props"]));
