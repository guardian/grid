import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useState, KeyboardEvent } from "react";

import "./gr-my-uploads.css";

const MY_UPLOADS = "My uploads";
const MY_UPLOADS_SHORT = "Mine";

export interface MyUploadsProps {
  onChange: (selected: boolean) => void;
}

export interface MyUploadsWrapperProps {
  props: MyUploadsProps;
}

const MyUploads: React.FC<MyUploadsWrapperProps> = ({ props }) => {

  const [myUploads, setMyUploads] = useState(false);

  const handleCheckboxClick = () => {
    setMyUploads(prevChkd => {
      props.onChange(!prevChkd);
      return !prevChkd;
      });
  };

  const handleKeyboard = (event:KeyboardEvent<HTMLDivElement>) => {
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      handleCheckboxClick();
    }
  };

  return (
    <div className="my-uploads-container" tabIndex={0} aria-label={MY_UPLOADS} onKeyDown={handleKeyboard}>
      <label className="custom-checkbox">
        <input type="checkbox" checked={myUploads} onChange={handleCheckboxClick}/>
        <div className="label-wrapper" >
          <span className="custom-label no-select">{MY_UPLOADS}</span>
          <span className="custom-label-short no-select">{MY_UPLOADS_SHORT}</span>
          <span className="custom-span"></span>
        </div>
      </label>
    </div>
  );
};

export const myUploads = angular.module('gr.myUploads', [])
  .component('myUploads', react2angular(MyUploads, ["props"]));
