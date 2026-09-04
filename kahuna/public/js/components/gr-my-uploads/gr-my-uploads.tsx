import * as React from "react";
import * as angular from "angular";
import { react2angular } from "react2angular";
import { useState, useEffect, KeyboardEvent } from "react";

import "./gr-my-uploads.css";

const MY_UPLOADS = "My uploads";
const MY_UPLOADS_SHORT = "My uploads";

export interface MyUploadsProps {
  myUploads: boolean,
  onChange: (selected: boolean) => void;
}

export interface MyUploadsWrapperProps {
  props: MyUploadsProps;
}

//-- filter change event --
interface Filter { uploadedByMe: boolean }
interface FilterChangeEventDetail { filter: Filter }
interface FilterChangeEvent extends CustomEvent<FilterChangeEventDetail> {optional?: string}

//-- uploadedBy check event --
interface UploadedByEventDetail { userEmail: string, uploadedBy: string }
interface UploadedByEvent extends CustomEvent<UploadedByEventDetail> {optional?: string}

//-- payable images event --
interface PayableImagesEventDetail { showPaid: boolean }

//-- main control --
const MyUploads: React.FC<MyUploadsWrapperProps> = ({ props }) => {

  const [myUploads, setMyUploads] = useState(props.myUploads);

  useEffect(() => {
    setMyUploads(prev => prev === props.myUploads ? prev : props.myUploads);
  }, [props.myUploads]);

  const handleCheckboxClick = () => {
    setMyUploads(prevChkd => {
      props.onChange(!prevChkd);

      //-- raise payable images event --
      const event = new CustomEvent<PayableImagesEventDetail>('setPayableImages', {
        detail: { showPaid: !prevChkd },
        bubbles: true
      });
      window.dispatchEvent(event);

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

  const handleLogoClick = () => {
    setMyUploads(prev => prev ? false : prev);
  };

  const handleFilterChange = (event: FilterChangeEvent) => {
    const next = event.detail.filter.uploadedByMe;
    setMyUploads(prev => prev === next ? prev : next);
  };

  const handleUploadedBy =  (event: UploadedByEvent) => {
    const matches: boolean = (event.detail.userEmail === event.detail.uploadedBy);
    setMyUploads(prev => prev === matches ? prev : matches);
  };

  useEffect(() => {
    window.addEventListener('logoClick', handleLogoClick);
    window.addEventListener('filterChangeEvent', handleFilterChange);
    window.addEventListener('uploadedByEvent', handleUploadedBy);
    return () => {
      window.removeEventListener('logoClick', handleLogoClick);
      window.removeEventListener('filterChangeEvent', handleFilterChange);
      window.removeEventListener('uploadedByEvent', handleUploadedBy);
    };
  }, []);

  return (
    <div className="my-uploads-container" tabIndex={0} aria-label={MY_UPLOADS} onKeyDown={handleKeyboard}>
      <label className="custom-checkbox">
        <input type="checkbox" checked={myUploads} onClick={handleCheckboxClick}/>
        <div className="label-wrapper" >
          <span className="custom-span"></span>
          <span className="custom-label no-select">{MY_UPLOADS}</span>
          <span className="custom-label-short no-select">{MY_UPLOADS_SHORT}</span>
        </div>
      </label>
    </div>
  );
};

export const myUploads = angular.module('gr.myUploads', [])
  .component('myUploads', react2angular(MyUploads, ["props"]));
