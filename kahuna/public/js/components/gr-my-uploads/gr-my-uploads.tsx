import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useState } from "react";

import "./gr-my-uploads.css";

const MY_UPLOADS:string = "My uploads";

export interface MyUploadsProps {
  onChange: (selected: boolean) => void;
}

export interface MyUploadsWrapperProps {
  props: MyUploadsProps;
}

const MyUploads: React.FC<MyUploadsWrapperProps> = ({ props }) => {

  const [myUploads, setMyUploads] = useState(false);

  const handleCheckboxClick = () => {
    let chkd = myUploads;
    setMyUploads(!chkd);
    props.onChange(!chkd);
  };

  return (
    <div className="outer-my-uploads-container">
      <div className="my-uploads-checkbox">
        <input type="checkbox" checked={myUploads} onChange={handleCheckboxClick} />
      </div>
      <div className="my-uploads-label">{MY_UPLOADS}</div>
    </div>
  );
};

export const myUploads = angular.module('gr.myUploads', [])
  .component('myUploads', react2angular(MyUploads, ["props"]));


