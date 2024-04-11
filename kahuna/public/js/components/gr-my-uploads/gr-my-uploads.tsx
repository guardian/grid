import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useState } from "react";

import "./gr-my-uploads.css";

const MY_UPLOADS = "My uploads";

export interface MyUploadsProps {
  onChange: (selected: boolean) => void;
}

export interface MyUploadsWrapperProps {
  props: MyUploadsProps;
}

const MyUploads: React.FC<MyUploadsWrapperProps> = ({ props }) => {

  const [myUploads, setMyUploads] = useState(false);

  const handleCheckboxClick = () => {
    const chkd = myUploads;
    setMyUploads(!chkd);
    props.onChange(!chkd);
  };

  return (
    <div className="my-uploads-container">
      <label className="custom-checkbox">
        <input type="checkbox" onChange={handleCheckboxClick}/>
        <div className="label-wrapper">
          <span className="custom-span"></span>
          <span className="custom-label">{MY_UPLOADS}</span>
        </div>
      </label>
    </div>
  );
};

export const myUploads = angular.module('gr.myUploads', [])
  .component('myUploads', react2angular(MyUploads, ["props"]));
