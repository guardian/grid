import * as React from "react";
import { useState, useEffect, KeyboardEvent } from "react";

import './gr-tab-swap.css';

export interface TabSwapProps {
  onSelect: (withTaken: boolean) => void;
  query: string;
  showTakenTab: boolean;
  noTakenDateCount: number;
  panelVisible: boolean;
}

export const TabControl: React.FC<TabSwapProps> = ({ onSelect, query, showTakenTab, noTakenDateCount, panelVisible }) => {

  const withLabel = "With taken date";
  const withoutLabel = "Without taken date";
  const CONTROL_TITLE = "Has Taken Date Selector";
  const PANEL_IDENTIFIER = "collections";
  const SCROLL_IDENTIFIER = "scroll";
  const HAS_DATE_TAKEN_QUERY = "has:dateTaken";
  const without = `-${HAS_DATE_TAKEN_QUERY}`;

  let tabStart = 'with';
  if (query.includes(without)) {
    tabStart = 'without';
  }

  const [activeTab, setActiveTab] = useState<string>(tabStart);
  const [isSortTaken, setIsSortTaken] = useState<boolean>(showTakenTab);
  const [isPanelVisible, setIsPanelVisible] = useState<boolean>(panelVisible);

  let takenDateMsg = "";
  if (noTakenDateCount === 1) {
    takenDateMsg = " (1 match)";
  } else if (noTakenDateCount > 1) {
    takenDateMsg = ` (${noTakenDateCount.toLocaleString()} matches)`;
  }

  const handleTabClick = (tabSelected: string) => {
    if (tabSelected !== activeTab) {
      setActiveTab(tabSelected);
      onSelect('with' === tabSelected);
    }
  };

  const handleKeyboard = (event:KeyboardEvent<HTMLDivElement>) => {
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      if (activeTab === 'without') {
        setActiveTab('with');
        onSelect(true);
      } else {
        setActiveTab('without');
        onSelect(false);
      }
    }
  };

  useEffect(() => {
    const handlePanelShow = (event: any) => {
      const panel = event.detail.panel;
       if (panel === PANEL_IDENTIFIER) {
         setIsPanelVisible(true);
       }
    };

    const handlePanelHide = (event: any) => {
      const panel = event.detail.panel;
       if (panel === PANEL_IDENTIFIER || panel === SCROLL_IDENTIFIER) {
         setIsPanelVisible(false);
       }
    };

    window.addEventListener("panelHide", handlePanelHide);
    window.addEventListener("panelShow", handlePanelShow);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener("panelHide", handlePanelHide);
      window.removeEventListener("panelShow", handlePanelShow);
    };
  }, []);

  return (
    <div className={`gr-tab-wrapper ${isPanelVisible ? 'gr-tab-panel-margin' : ''}`}>
      {(isSortTaken && noTakenDateCount > 0) && (
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
            {`${withoutLabel}${takenDateMsg}`}
          </div>
        </div>
      )}
    </div>
  );
};
