import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useState, useEffect, KeyboardEvent } from "react";

import "./gr-my-crops.css";

const MY_CROPS = "My crops";
const MY_CROPS_SHORT = "My crops";

export interface MyCropsProps {
  myCrops: boolean,
  onChange: (selected: boolean) => void;
}

export interface MyCropsWrapperProps {
  props: MyCropsProps;
}

//-- filter change event --
interface Filter { croppedByMe: boolean }
interface FilterChangeEventDetail { filter: Filter }

//-- main control --
const MyCrops: React.FC<MyCropsWrapperProps> = ({ props }) => {

  const [myCrops, setMyCrops] = useState(props.myCrops);

  const handleCheckboxClick = () => {
    setMyCrops(prevChkd => {
      props.onChange(!prevChkd);
      return !prevChkd;
    });
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      handleCheckboxClick();
    }
  };

  const handleFilterChange = (event: CustomEvent<FilterChangeEventDetail>) => {
    setMyCrops(event.detail.filter.croppedByMe);
  };

  useEffect(() => {
    window.addEventListener('filterChangeEvent', handleFilterChange);
    return () => {
      window.removeEventListener('filterChangeEvent', handleFilterChange);
    };
  }, []);

  return (
    <div className="my-crops-container" tabIndex={0} aria-label={MY_CROPS} onKeyDown={handleKeyboard}>
      <label className="custom-checkbox">
        <input type="checkbox" checked={myCrops} onClick={handleCheckboxClick}/>
        <div className="label-wrapper">
          <span className="custom-span"></span>
          <span className="custom-label no-select">{MY_CROPS}</span>
          <span className="custom-label-short no-select">{MY_CROPS_SHORT}</span>
        </div>
      </label>
    </div>
  );
};

export const myCrops = angular.module('gr.myCrops', [])
  .component('myCrops', react2angular(MyCrops, ["props"]));
